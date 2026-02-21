"""SEC EDGAR data fetcher"""

import hashlib
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict
from xml.etree import ElementTree as ET

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from tenacity import retry, wait_exponential_jitter, stop_after_attempt

from src.config import settings
from src.models import Company, DocumentMetadata


class EdgarFetcher:
    """Fetches filings from SEC EDGAR"""

    BASE_URL = "https://www.sec.gov"
    BROWSE_URL = f"{BASE_URL}/cgi-bin/browse-edgar"
    ARCHIVES_URL = f"{BASE_URL}/Archives/edgar/data"

    def __init__(self, rate_limit: float = None):
        """
        Initialize EDGAR fetcher

        Args:
            rate_limit: Requests per second (default from settings)
        """
        self.rate_limit = rate_limit or settings.edgar_rate_limit
        self.min_delay = 1.0 / self.rate_limit
        self.last_request = 0.0
        self.headers = {"User-Agent": settings.user_agent}

    def _throttle(self):
        """Implement rate limiting"""
        now = time.time()
        elapsed = now - self.last_request
        if elapsed < self.min_delay:
            time.sleep(self.min_delay - elapsed)
        self.last_request = time.time()

    @retry(wait=wait_exponential_jitter(1, 30), stop=stop_after_attempt(6))
    def _fetch(self, url: str) -> httpx.Response:
        """Fetch URL with retry logic"""
        self._throttle()
        logger.debug(f"Fetching {url}")

        with httpx.Client(timeout=60.0, follow_redirects=True, headers=self.headers) as client:
            response = client.get(url)
            response.raise_for_status()
            return response

    def get_cik(self, ticker: str) -> str:
        """
        Resolve ticker to CIK (Central Index Key)

        Args:
            ticker: Company ticker symbol

        Returns:
            CIK with leading zeros (10 digits)
        """
        url = f"{self.BROWSE_URL}?action=getcompany&CIK={ticker}&type=&dateb=&owner=exclude&count=1"
        response = self._fetch(url)

        soup = BeautifulSoup(response.text, "html.parser")
        cik_text = soup.find("span", class_="companyName")

        if not cik_text:
            raise ValueError(f"Could not find CIK for ticker {ticker}")

        # Extract CIK from format "COMPANY NAME (CIK: 0001234567)"
        cik = cik_text.text.split("CIK:")[1].split(")")[0].strip()
        return cik.zfill(10)

    def list_filings(
        self,
        cik: str,
        filing_type: str,
        since_date: str = None,
        count: int = 100
    ) -> List[Dict]:
        """
        List filings for a company

        Args:
            cik: Company CIK
            filing_type: Filing type (10-K, 10-Q, 8-K, DEF 14A)
            since_date: Only return filings after this date (YYYY-MM-DD)
            count: Maximum number of filings to retrieve

        Returns:
            List of filing dictionaries with metadata
        """
        url = (
            f"{self.BROWSE_URL}?action=getcompany&CIK={cik}"
            f"&type={filing_type}&count={count}&owner=exclude&output=atom"
        )

        response = self._fetch(url)

        # Parse Atom feed
        root = ET.fromstring(response.content)
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        filings = []
        for entry in root.findall("atom:entry", ns):
            filing_date = entry.find("atom:updated", ns).text[:10]

            # Filter by date if specified
            if since_date and filing_date < since_date:
                continue

            # Extract accession number from filing URL
            filing_url = entry.find("atom:link[@rel='alternate']", ns).attrib["href"]
            accession = filing_url.split("/")[-1].replace("-index.htm", "")

            filing_info = {
                "filing_type": filing_type,
                "filing_date": filing_date,
                "accession": accession,
                "filing_url": filing_url,
            }
            filings.append(filing_info)

        logger.info(f"Found {len(filings)} {filing_type} filings for CIK {cik}")
        return filings

    def get_primary_document(self, cik: str, accession: str) -> Optional[str]:
        """
        Get the primary document filename for a filing

        Args:
            cik: Company CIK
            accession: Filing accession number

        Returns:
            Primary document filename
        """
        # Remove dashes from accession number for URL
        accession_nodash = accession.replace("-", "")

        # Fetch the index page
        index_url = f"{self.ARCHIVES_URL}/{cik}/{accession_nodash}/{accession}-index.htm"
        response = self._fetch(index_url)

        soup = BeautifulSoup(response.text, "html.parser")

        # Look for the primary document table
        for table in soup.find_all("table"):
            for row in table.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) >= 3 and cells[3].text.strip() in ["PRIMARY DOCUMENT", "DOCUMENT"]:
                    doc_link = cells[2].find("a")
                    if doc_link:
                        return doc_link["href"].split("/")[-1]

        # Fallback: look for common naming patterns
        common_names = [
            f"{accession}.htm",
            f"{accession}.html",
            f"d{accession_nodash}.htm",
        ]

        for name in common_names:
            try:
                test_url = f"{self.ARCHIVES_URL}/{cik}/{accession_nodash}/{name}"
                response = self._fetch(test_url)
                if response.status_code == 200:
                    return name
            except:
                continue

        logger.warning(f"Could not find primary document for {accession}")
        return None

    def download_filing(
        self,
        company: Company,
        filing_type: str,
        accession: str,
        filing_date: str,
        output_dir: Path
    ) -> Optional[DocumentMetadata]:
        """
        Download a filing and generate metadata

        Args:
            company: Company object
            filing_type: Filing type (10-K, 10-Q, etc.)
            accession: Filing accession number
            filing_date: Filing date
            output_dir: Directory to save file

        Returns:
            DocumentMetadata or None if download fails
        """
        cik = company.cik
        primary_doc = self.get_primary_document(cik, accession)

        if not primary_doc:
            logger.error(f"Could not find primary document for {accession}")
            return None

        # Construct download URL
        accession_nodash = accession.replace("-", "")
        doc_url = f"{self.ARCHIVES_URL}/{cik}/{accession_nodash}/{primary_doc}"

        # Generate filename
        doc_type_slug = filing_type.lower().replace(" ", "").replace("-", "")
        file_id = f"{company.company_id}__{doc_type_slug}__{filing_date}__sec_edgar__en__{primary_doc}"
        output_path = output_dir / file_id

        # Download file
        logger.info(f"Downloading {file_id}")
        response = self._fetch(doc_url)

        output_path.write_bytes(response.content)

        # Compute SHA-256
        sha256 = hashlib.sha256(response.content).hexdigest()

        # Determine MIME type
        mime_type = "text/html"
        if primary_doc.endswith(".pdf"):
            mime_type = "application/pdf"

        # Create metadata
        metadata = DocumentMetadata(
            file_id=file_id,
            company_id=company.company_id,
            company_name=company.company_name,
            ticker=company.ticker,
            doc_type=doc_type_slug,
            filing_date=filing_date,
            source_type="primary",
            source_url=doc_url,
            fetched_at_utc=datetime.utcnow(),
            byte_size=len(response.content),
            mime_type=mime_type,
            sha256=sha256,
            redistributable=True,
            confidence=0.98,
        )

        return metadata

    def fetch_company_filings(
        self,
        company: Company,
        output_dir: Path,
        since_date: str = None
    ) -> List[DocumentMetadata]:
        """
        Fetch all required filings for a company

        Args:
            company: Company object
            output_dir: Directory to save files
            since_date: Only fetch filings after this date

        Returns:
            List of DocumentMetadata objects
        """
        if not company.cik:
            logger.warning(f"{company.company_name} has no CIK (not a US company)")
            return []

        output_dir.mkdir(parents=True, exist_ok=True)

        since_date = since_date or settings.since_date
        metadata_list = []

        # Define filing types to fetch
        filing_types = ["10-K", "10-Q", "8-K", "DEF 14A"]

        for filing_type in filing_types:
            try:
                filings = self.list_filings(company.cik, filing_type, since_date)

                # For 10-K, get only the latest
                if filing_type == "10-K":
                    filings = filings[:1]

                for filing in filings:
                    metadata = self.download_filing(
                        company=company,
                        filing_type=filing_type,
                        accession=filing["accession"],
                        filing_date=filing["filing_date"],
                        output_dir=output_dir
                    )
                    if metadata:
                        metadata_list.append(metadata)

            except Exception as e:
                logger.error(f"Error fetching {filing_type} for {company.company_name}: {e}")

        logger.info(f"Fetched {len(metadata_list)} filings for {company.company_name}")
        return metadata_list
