#!/usr/bin/env python3
"""
Build the RadarAI demo data package

This script orchestrates the entire data package build process:
1. Fetch filings from SEC EDGAR (US companies)
2. Fetch reports from company IR sites (all companies)
3. Extract text, sections, and tables from PDFs
4. Generate manifest and checksums
5. Create package README

Usage:
    python scripts/build_data_package.py [--output-dir OUTPUT_DIR] [--companies COMPANY_IDS]
"""

import argparse
from pathlib import Path
from typing import List

from loguru import logger

from src.config import load_companies, settings
from src.models import Company, DocumentMetadata
from src.ingestion.edgar import EdgarFetcher
from src.ingestion.ir_sites import IRSiteFetcher
from src.extraction.pdf_extractor import PDFExtractor
from src.utils import create_manifest, create_checksums_file, create_readme, get_git_commit


class DataPackageBuilder:
    """Orchestrates the data package build process"""

    def __init__(self, output_dir: Path):
        """
        Initialize builder

        Args:
            output_dir: Base directory for output
        """
        self.output_dir = output_dir
        self.source_dir = output_dir / "companies"
        self.extracted_dir = output_dir / "extracted"

        self.edgar_fetcher = EdgarFetcher()
        self.ir_fetcher = IRSiteFetcher()
        self.pdf_extractor = PDFExtractor()

        self.all_metadata: List[DocumentMetadata] = []

    def fetch_edgar_filings(self, company: Company):
        """
        Fetch SEC EDGAR filings for a US company

        Args:
            company: Company object
        """
        if not company.cik:
            logger.info(f"Skipping EDGAR for {company.company_name} (not a US company)")
            return

        logger.info(f"Fetching EDGAR filings for {company.company_name}")

        company_dir = self.source_dir / company.company_id / "sec_edgar"
        company_dir.mkdir(parents=True, exist_ok=True)

        metadata_list = self.edgar_fetcher.fetch_company_filings(
            company=company,
            output_dir=company_dir,
            since_date=settings.since_date
        )

        self.all_metadata.extend(metadata_list)
        logger.info(f"Fetched {len(metadata_list)} EDGAR filings for {company.company_name}")

    def fetch_ir_documents(self, company: Company):
        """
        Fetch documents from company IR site

        Args:
            company: Company object
        """
        logger.info(f"Fetching IR documents for {company.company_name}")

        company_dir = self.source_dir / company.company_id / "ir"
        company_dir.mkdir(parents=True, exist_ok=True)

        # Fetch annual report (for non-US companies)
        if not company.cik:
            metadata = self.ir_fetcher.fetch_annual_report(company, company_dir)
            if metadata:
                self.all_metadata.append(metadata)

        # Fetch sustainability report (all companies)
        metadata = self.ir_fetcher.fetch_sustainability_report(company, company_dir)
        if metadata:
            self.all_metadata.append(metadata)

        logger.info(f"Fetched IR documents for {company.company_name}")

    def extract_pdfs(self):
        """
        Extract text, sections, and tables from all PDFs
        """
        logger.info("Extracting PDFs...")

        # Find all PDF files
        pdf_files = list(self.source_dir.glob("**/*.pdf"))
        logger.info(f"Found {len(pdf_files)} PDF files to extract")

        for pdf_path in pdf_files:
            logger.info(f"Extracting {pdf_path.name}")

            try:
                # Extract all content
                results = self.pdf_extractor.extract_all(
                    pdf_path=pdf_path,
                    output_base_dir=self.extracted_dir
                )

                # Update metadata with extraction results
                file_id = pdf_path.name
                for metadata in self.all_metadata:
                    if metadata.file_id == file_id:
                        metadata.extracted_text_path = results["text_path"]
                        metadata.table_csv_paths = results["table_paths"]
                        metadata.extraction_notes = (
                            f"Extracted {results['text_length']} chars, "
                            f"{results['num_sections']} sections, "
                            f"{results['num_tables']} tables"
                        )
                        break

            except Exception as e:
                logger.error(f"Error extracting {pdf_path.name}: {e}")

        logger.info(f"Completed PDF extraction")

    def build_package(self, companies: List[Company]):
        """
        Build the complete data package

        Args:
            companies: List of companies to process
        """
        logger.info(f"Building data package for {len(companies)} companies")
        logger.info(f"Output directory: {self.output_dir}")

        # Step 1: Fetch data
        for company in companies:
            logger.info(f"\n{'='*60}")
            logger.info(f"Processing {company.company_name} ({company.ticker})")
            logger.info(f"{'='*60}")

            try:
                self.fetch_edgar_filings(company)
            except Exception as e:
                logger.error(f"Error fetching EDGAR filings for {company.company_name}: {e}")

            try:
                self.fetch_ir_documents(company)
            except Exception as e:
                logger.error(f"Error fetching IR documents for {company.company_name}: {e}")

        # Step 2: Extract PDFs
        logger.info(f"\n{'='*60}")
        logger.info("PDF Extraction Phase")
        logger.info(f"{'='*60}")

        try:
            self.extract_pdfs()
        except Exception as e:
            logger.error(f"Error during PDF extraction: {e}")

        # Step 3: Generate manifest
        logger.info(f"\n{'='*60}")
        logger.info("Manifest Generation Phase")
        logger.info(f"{'='*60}")

        git_commit = get_git_commit()

        manifest = create_manifest(
            files=self.all_metadata,
            output_path=self.output_dir / "manifest.json",
            git_commit=git_commit
        )

        # Step 4: Create checksums
        create_checksums_file(
            manifest=manifest,
            output_path=self.output_dir / "checksums.sha256"
        )

        # Step 5: Create README
        create_readme(
            manifest=manifest,
            output_path=self.output_dir / "README.md"
        )

        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("Build Complete!")
        logger.info(f"{'='*60}")
        logger.info(f"Total files: {len(self.all_metadata)}")
        logger.info(f"Output directory: {self.output_dir}")
        logger.info(f"Manifest: {self.output_dir / 'manifest.json'}")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Build RadarAI demo data package")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=settings.output_dir / f"fashion_demo_package_{settings.as_of_date}",
        help="Output directory for data package"
    )
    parser.add_argument(
        "--companies",
        nargs="+",
        help="Specific company IDs to process (default: all)"
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level"
    )

    args = parser.parse_args()

    # Configure logging
    logger.remove()
    logger.add(
        lambda msg: print(msg, end=""),
        level=args.log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
    )

    # Also log to file
    log_file = args.output_dir / "logs" / "build.log"
    log_file.parent.mkdir(parents=True, exist_ok=True)
    logger.add(log_file, level="DEBUG")

    # Load companies
    all_companies = load_companies()

    # Filter companies if specified
    if args.companies:
        companies = [c for c in all_companies if c.company_id in args.companies]
        if not companies:
            logger.error(f"No companies found matching: {args.companies}")
            return
    else:
        companies = all_companies

    # Build package
    builder = DataPackageBuilder(output_dir=args.output_dir)
    builder.build_package(companies)


if __name__ == "__main__":
    main()
