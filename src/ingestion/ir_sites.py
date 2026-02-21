"""Company investor relations site fetcher"""

import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from tenacity import retry, wait_exponential_jitter, stop_after_attempt
import trafilatura

from src.config import settings
from src.models import Company, DocumentMetadata


class IRSiteFetcher:
    """Fetches documents from company investor relations sites"""

    def __init__(self, rate_limit: float = None):
        """
        Initialize IR site fetcher

        Args:
            rate_limit: Requests per second (default from settings)
        """
        self.rate_limit = rate_limit or settings.ir_rate_limit
        self.min_delay = 1.0 / self.rate_limit
        self.last_request_by_host = {}
        self.headers = {"User-Agent": settings.user_agent}

    def _throttle(self, url: str):
        """Implement per-host rate limiting"""
        host = urlparse(url).netloc
        now = time.time()
        last = self.last_request_by_host.get(host, 0)
        elapsed = now - last

        if elapsed < self.min_delay:
            time.sleep(self.min_delay - elapsed)

        self.last_request_by_host[host] = time.time()

    @retry(wait=wait_exponential_jitter(1, 30), stop=stop_after_attempt(6))
    def _fetch(self, url: str) -> httpx.Response:
        """Fetch URL with retry logic"""
        self._throttle(url)
        logger.debug(f"Fetching {url}")

        with httpx.Client(timeout=60.0, follow_redirects=True, headers=self.headers) as client:
            response = client.get(url)
            response.raise_for_status()
            return response

    def discover_pdf_links(self, url: str, keywords: List[str] = None) -> List[Dict]:
        """
        Discover PDF links on a page

        Args:
            url: URL to scan
            keywords: Optional keywords to filter links (case-insensitive)

        Returns:
            List of dicts with 'url', 'text', and 'date' keys
        """
        response = self._fetch(url)
        soup = BeautifulSoup(response.text, "html.parser")

        pdf_links = []
        for link in soup.find_all("a", href=True):
            href = link["href"]
            link_text = link.get_text(strip=True)

            # Check if it's a PDF
            if not href.lower().endswith(".pdf"):
                continue

            # Convert relative URLs to absolute
            absolute_url = urljoin(url, href)

            # Filter by keywords if provided
            if keywords:
                if not any(kw.lower() in link_text.lower() for kw in keywords):
                    continue

            pdf_links.append({
                "url": absolute_url,
                "text": link_text,
                "date": None  # Could be enhanced to extract dates from text
            })

        logger.info(f"Found {len(pdf_links)} PDF links on {url}")
        return pdf_links

    def download_pdf(
        self,
        company: Company,
        pdf_url: str,
        doc_type: str,
        output_dir: Path,
        doc_date: str = None
    ) -> Optional[DocumentMetadata]:
        """
        Download a PDF and generate metadata

        Args:
            company: Company object
            pdf_url: URL of PDF to download
            doc_type: Document type
            output_dir: Directory to save file
            doc_date: Document date (YYYY-MM-DD)

        Returns:
            DocumentMetadata or None if download fails
        """
        try:
            response = self._fetch(pdf_url)

            # Validate it's actually a PDF
            if not response.content[:4] == b"%PDF":
                logger.warning(f"File at {pdf_url} is not a valid PDF")
                return None

            # Generate filename
            date_str = doc_date or datetime.utcnow().strftime("%Y-%m-%d")
            filename = Path(pdf_url).name
            file_id = f"{company.company_id}__{doc_type}__{date_str}__ir__en__{filename}"
            output_path = output_dir / file_id

            # Save file
            output_path.write_bytes(response.content)

            # Compute SHA-256
            sha256 = hashlib.sha256(response.content).hexdigest()

            # Create metadata
            metadata = DocumentMetadata(
                file_id=file_id,
                company_id=company.company_id,
                company_name=company.company_name,
                ticker=company.ticker,
                doc_type=doc_type,
                doc_date=date_str,
                source_type="primary",
                source_url=pdf_url,
                fetched_at_utc=datetime.utcnow(),
                byte_size=len(response.content),
                mime_type="application/pdf",
                sha256=sha256,
                redistributable=True,  # Assume IR documents are public
                confidence=0.95,
            )

            logger.info(f"Downloaded {file_id}")
            return metadata

        except Exception as e:
            logger.error(f"Error downloading PDF from {pdf_url}: {e}")
            return None

    def download_press_release(
        self,
        company: Company,
        pr_url: str,
        output_dir: Path,
        doc_date: str = None
    ) -> Optional[DocumentMetadata]:
        """
        Download a press release and extract text

        Args:
            company: Company object
            pr_url: URL of press release
            output_dir: Directory to save file
            doc_date: Document date (YYYY-MM-DD)

        Returns:
            DocumentMetadata or None if download fails
        """
        try:
            response = self._fetch(pr_url)

            # Extract clean text using trafilatura
            text = trafilatura.extract(response.text, include_comments=False)

            if not text:
                logger.warning(f"Could not extract text from {pr_url}")
                return None

            # Generate filename
            date_str = doc_date or datetime.utcnow().strftime("%Y-%m-%d")
            url_slug = urlparse(pr_url).path.split("/")[-1][:50]
            file_id = f"{company.company_id}__press_release__{date_str}__ir__en__{url_slug}.html"
            output_path = output_dir / file_id

            # Save HTML
            output_path.write_bytes(response.content)

            # Also save extracted text
            text_path = output_dir / file_id.replace(".html", ".txt")
            text_path.write_text(text, encoding="utf-8")

            # Compute SHA-256 of HTML
            sha256 = hashlib.sha256(response.content).hexdigest()

            # Create metadata
            metadata = DocumentMetadata(
                file_id=file_id,
                company_id=company.company_id,
                company_name=company.company_name,
                ticker=company.ticker,
                doc_type="press_release",
                doc_date=date_str,
                source_type="primary",
                source_url=pr_url,
                fetched_at_utc=datetime.utcnow(),
                byte_size=len(response.content),
                mime_type="text/html",
                sha256=sha256,
                redistributable=True,
                confidence=0.90,
                extracted_text_path=str(text_path.relative_to(output_dir.parent)),
            )

            logger.info(f"Downloaded press release {file_id}")
            return metadata

        except Exception as e:
            logger.error(f"Error downloading press release from {pr_url}: {e}")
            return None

    def fetch_annual_report(
        self,
        company: Company,
        output_dir: Path
    ) -> Optional[DocumentMetadata]:
        """
        Fetch the latest annual report for a company

        Args:
            company: Company object
            output_dir: Directory to save file

        Returns:
            DocumentMetadata or None if not found
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        # Discover PDFs on IR page
        pdf_links = self.discover_pdf_links(
            str(company.ir_url),
            keywords=["annual report", "annual financial", "geschäftsbericht", "informe anual"]
        )

        if not pdf_links:
            logger.warning(f"No annual report found for {company.company_name}")
            return None

        # Download the first (most recent) report
        return self.download_pdf(
            company=company,
            pdf_url=pdf_links[0]["url"],
            doc_type="annual_report",
            output_dir=output_dir
        )

    def fetch_sustainability_report(
        self,
        company: Company,
        output_dir: Path
    ) -> Optional[DocumentMetadata]:
        """
        Fetch the latest sustainability report for a company

        Args:
            company: Company object
            output_dir: Directory to save file

        Returns:
            DocumentMetadata or None if not found
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        # Discover PDFs on sustainability page
        pdf_links = self.discover_pdf_links(
            str(company.sustainability_url),
            keywords=["sustainability", "impact", "esg", "csr"]
        )

        if not pdf_links:
            logger.warning(f"No sustainability report found for {company.company_name}")
            return None

        # Download the first (most recent) report
        return self.download_pdf(
            company=company,
            pdf_url=pdf_links[0]["url"],
            doc_type="sustainability",
            output_dir=output_dir
        )
