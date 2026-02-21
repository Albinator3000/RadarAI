"""PDF text and table extraction"""

import re
from pathlib import Path
from typing import List, Dict, Optional, Tuple

import pymupdf  # PyMuPDF
import pdfplumber
from loguru import logger

# Camelot is optional (requires system dependencies)
try:
    import camelot
    CAMELOT_AVAILABLE = True
except ImportError:
    CAMELOT_AVAILABLE = False
    logger.warning("Camelot not available - table extraction will use pdfplumber only")


class PDFExtractor:
    """Extract text, sections, and tables from PDFs"""

    # Common section headings in financial filings
    SECTION_PATTERNS = [
        r"(?i)^risk\s+factors?",
        r"(?i)^management'?s?\s+discussion\s+and\s+analysis",
        r"(?i)^md&a",
        r"(?i)^competition",
        r"(?i)^competitive\s+landscape",
        r"(?i)^legal\s+proceedings?",
        r"(?i)^business\s+overview",
        r"(?i)^operating\s+review",
        r"(?i)^financial\s+statements?",
        r"(?i)^notes\s+to\s+(the\s+)?financial\s+statements?",
        r"(?i)^segment\s+reporting",
        r"(?i)^geographic\s+information",
    ]

    def __init__(self):
        """Initialize PDF extractor"""
        self.section_regex = [re.compile(pattern) for pattern in self.SECTION_PATTERNS]

    def extract_text(self, pdf_path: Path) -> str:
        """
        Extract all text from a PDF

        Args:
            pdf_path: Path to PDF file

        Returns:
            Extracted text
        """
        try:
            doc = pymupdf.open(str(pdf_path))
            text_parts = []

            for page_num in range(len(doc)):
                page = doc[page_num]
                text_parts.append(page.get_text())

            doc.close()

            full_text = "\n".join(text_parts)
            logger.info(f"Extracted {len(full_text)} characters from {pdf_path.name}")
            return full_text

        except Exception as e:
            logger.error(f"Error extracting text from {pdf_path}: {e}")
            return ""

    def detect_sections(self, text: str) -> List[Dict[str, any]]:
        """
        Detect major sections in extracted text

        Args:
            text: Full extracted text

        Returns:
            List of section dictionaries with 'title', 'start', 'end'
        """
        sections = []
        lines = text.split("\n")

        for i, line in enumerate(lines):
            line_stripped = line.strip()

            # Skip empty lines or very long lines (unlikely to be headings)
            if not line_stripped or len(line_stripped) > 200:
                continue

            # Check if line matches any section pattern
            for pattern in self.section_regex:
                if pattern.match(line_stripped):
                    # Calculate character position
                    char_pos = sum(len(l) + 1 for l in lines[:i])

                    sections.append({
                        "title": line_stripped,
                        "start": char_pos,
                        "pattern": pattern.pattern,
                    })
                    break

        # Calculate end positions (start of next section)
        for i in range(len(sections)):
            if i < len(sections) - 1:
                sections[i]["end"] = sections[i + 1]["start"]
            else:
                sections[i]["end"] = len(text)

        logger.info(f"Detected {len(sections)} sections")
        return sections

    def extract_sections(self, pdf_path: Path, output_dir: Path) -> List[str]:
        """
        Extract text sections and save to individual files

        Args:
            pdf_path: Path to PDF file
            output_dir: Directory to save section files

        Returns:
            List of section file paths
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        # Extract full text
        text = self.extract_text(pdf_path)

        if not text:
            return []

        # Detect sections
        sections = self.detect_sections(text)

        section_paths = []
        for i, section in enumerate(sections):
            # Extract section text
            section_text = text[section["start"]:section["end"]]

            # Generate filename
            section_slug = re.sub(r"[^\w\s-]", "", section["title"].lower())
            section_slug = re.sub(r"[-\s]+", "-", section_slug)[:50]
            section_filename = f"{pdf_path.stem}__section_{i:02d}__{section_slug}.txt"
            section_path = output_dir / section_filename

            # Save section
            section_path.write_text(section_text, encoding="utf-8")
            section_paths.append(str(section_path))

            logger.debug(f"Saved section: {section['title']}")

        logger.info(f"Extracted {len(section_paths)} sections to {output_dir}")
        return section_paths

    def extract_tables(self, pdf_path: Path, output_dir: Path) -> List[str]:
        """
        Extract tables from PDF and save as CSV

        Args:
            pdf_path: Path to PDF file
            output_dir: Directory to save CSV files

        Returns:
            List of CSV file paths
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        table_paths = []

        # Try Camelot first if available (works well with vector PDFs)
        if CAMELOT_AVAILABLE:
            try:
                tables = camelot.read_pdf(
                    str(pdf_path),
                    pages="all",
                    flavor="lattice",  # For tables with borders
                    suppress_stdout=True
                )

                # If no tables found, try stream mode
                if len(tables) == 0:
                    tables = camelot.read_pdf(
                        str(pdf_path),
                        pages="all",
                        flavor="stream",  # For tables without borders
                        suppress_stdout=True
                    )

                # Save each table as CSV
                for i, table in enumerate(tables):
                    csv_filename = f"{pdf_path.stem}__table_{i:03d}.csv"
                    csv_path = output_dir / csv_filename

                    table.df.to_csv(csv_path, index=False)
                    table_paths.append(str(csv_path))

                logger.info(f"Extracted {len(table_paths)} tables from {pdf_path.name} using Camelot")
                return table_paths

            except Exception as e:
                logger.warning(f"Camelot extraction failed for {pdf_path.name}: {e}")

        # Fallback to pdfplumber
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    tables = page.extract_tables()

                    for table_num, table in enumerate(tables):
                        if not table:
                            continue

                        # Convert to CSV
                        csv_filename = f"{pdf_path.stem}__table_p{page_num:03d}_t{table_num:02d}.csv"
                        csv_path = output_dir / csv_filename

                        # Write CSV manually
                        with open(csv_path, "w", encoding="utf-8") as f:
                            for row in table:
                                cleaned_row = [str(cell).replace(",", ";") if cell else "" for cell in row]
                                f.write(",".join(cleaned_row) + "\n")

                        table_paths.append(str(csv_path))

            logger.info(f"Extracted {len(table_paths)} tables using pdfplumber")

        except Exception as e2:
            logger.error(f"Table extraction failed for {pdf_path.name}: {e2}")

        return table_paths

    def extract_all(self, pdf_path: Path, output_base_dir: Path) -> Dict[str, any]:
        """
        Extract text, sections, and tables from a PDF

        Args:
            pdf_path: Path to PDF file
            output_base_dir: Base directory for output

        Returns:
            Dictionary with extraction results
        """
        company_doc_id = pdf_path.stem

        # Create output directories
        text_dir = output_base_dir / "text"
        sections_dir = output_base_dir / "sections" / company_doc_id
        tables_dir = output_base_dir / "tables" / company_doc_id

        # Extract full text
        full_text = self.extract_text(pdf_path)
        text_path = text_dir / f"{company_doc_id}.txt"
        text_dir.mkdir(parents=True, exist_ok=True)
        text_path.write_text(full_text, encoding="utf-8")

        # Extract sections
        section_paths = self.extract_sections(pdf_path, sections_dir)

        # Extract tables
        table_paths = self.extract_tables(pdf_path, tables_dir)

        results = {
            "text_path": str(text_path),
            "section_paths": section_paths,
            "table_paths": table_paths,
            "text_length": len(full_text),
            "num_sections": len(section_paths),
            "num_tables": len(table_paths),
        }

        logger.info(
            f"Extraction complete for {pdf_path.name}: "
            f"{results['text_length']} chars, "
            f"{results['num_sections']} sections, "
            f"{results['num_tables']} tables"
        )

        return results


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[Tuple[int, str]]:
    """
    Split text into overlapping chunks

    Args:
        text: Text to chunk
        chunk_size: Target chunk size in characters
        overlap: Overlap between chunks in characters

    Returns:
        List of (start_position, chunk_text) tuples
    """
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]

        # Try to break at sentence boundary
        if end < len(text):
            last_period = chunk.rfind(". ")
            if last_period > chunk_size * 0.7:  # Only break if period is in last 30%
                end = start + last_period + 2
                chunk = text[start:end]

        chunks.append((start, chunk))
        start = end - overlap

    return chunks
