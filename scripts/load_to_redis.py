#!/usr/bin/env python3
"""
Load extracted documents into RedisVL

This script loads document chunks with embeddings into RedisVL for semantic search.

Usage:
    python scripts/load_to_redis.py --manifest-path path/to/manifest.json
"""

import argparse
import json
from pathlib import Path
from typing import List
from datetime import datetime

from loguru import logger
import voyageai

from src.config import settings
from src.models import DocumentChunk, Manifest
from src.storage.redis_store import RedisVLStore
from src.extraction.pdf_extractor import chunk_text


class RedisLoader:
    """Loads documents into RedisVL"""

    def __init__(self, manifest_path: Path):
        """
        Initialize loader

        Args:
            manifest_path: Path to manifest.json
        """
        self.manifest_path = manifest_path
        self.manifest = self._load_manifest()
        self.redis_store = RedisVLStore()
        self.voyage_client = voyageai.Client(api_key=settings.voyage_api_key)

    def _load_manifest(self) -> Manifest:
        """Load manifest from JSON"""
        with open(self.manifest_path) as f:
            data = json.load(f)
        return Manifest(**data)

    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for text using Voyage AI

        Args:
            text: Text to embed

        Returns:
            Embedding vector (1024 dims for voyage-2)
        """
        result = self.voyage_client.embed(
            texts=[text[:4000]],  # Voyage limit is ~4k tokens
            model=settings.embedding_model,
            input_type="document"
        )
        return result.embeddings[0]

    def load_document(self, file_metadata) -> int:
        """
        Load a single document into RedisVL

        Args:
            file_metadata: DocumentMetadata from manifest

        Returns:
            Number of chunks created
        """
        # Only process PDFs and text documents
        if file_metadata.mime_type not in ["application/pdf", "text/html"]:
            logger.debug(f"Skipping non-text document: {file_metadata.file_id}")
            return 0

        # Load extracted text
        if not file_metadata.extracted_text_path:
            logger.warning(f"No extracted text for {file_metadata.file_id}")
            return 0

        text_path = self.manifest_path.parent / file_metadata.extracted_text_path

        if not text_path.exists():
            logger.warning(f"Text file not found: {text_path}")
            return 0

        text = text_path.read_text(encoding="utf-8")

        # Determine section (simplified - use doc_type as section)
        section = file_metadata.doc_type

        # Extract fiscal year from filing date or doc date
        fiscal_year = 2025  # Default
        date_str = file_metadata.fiscal_period_end or file_metadata.filing_date or file_metadata.doc_date
        if date_str:
            fiscal_year = int(date_str[:4])

        # Chunk the text
        chunks = chunk_text(text, chunk_size=1000, overlap=200)
        logger.info(f"Created {len(chunks)} chunks from {file_metadata.file_id}")

        # Create and store document chunks
        chunk_count = 0
        for i, (start_pos, chunk_text) in enumerate(chunks):
            # Generate embedding
            try:
                embedding = self.generate_embedding(chunk_text)
            except Exception as e:
                logger.error(f"Error generating embedding for chunk {i}: {e}")
                continue

            # Create DocumentChunk
            chunk_id = f"{file_metadata.company_id}_{file_metadata.doc_type}_{fiscal_year}_{i}"

            # Convert date to Unix timestamp
            if date_str:
                published_date = int(datetime.strptime(date_str, "%Y-%m-%d").timestamp())
            else:
                published_date = int(datetime.now().timestamp())

            chunk = DocumentChunk(
                id=chunk_id,
                company_id=file_metadata.company_id,
                ticker=file_metadata.ticker,
                doc_type=file_metadata.doc_type,
                fiscal_year=fiscal_year,
                section=section,
                text=chunk_text,
                embedding=embedding,
                published_date=published_date,
                language=file_metadata.language,
                source_file_id=file_metadata.file_id
            )

            # Store in Redis
            if self.redis_store.store_document_chunk(chunk):
                chunk_count += 1

        logger.info(f"Stored {chunk_count} chunks for {file_metadata.file_id}")
        return chunk_count

    def load_all(self):
        """
        Load all documents from manifest into RedisVL
        """
        # Initialize Redis indexes
        logger.info("Initializing Redis indexes...")
        self.redis_store.initialize_indexes(overwrite=False)

        # Check Redis health
        if not self.redis_store.health_check():
            logger.error("Redis connection failed. Exiting.")
            return

        # Process each file
        total_chunks = 0
        for i, file_meta in enumerate(self.manifest.files):
            logger.info(f"Processing file {i+1}/{len(self.manifest.files)}: {file_meta.file_id}")

            try:
                chunk_count = self.load_document(file_meta)
                total_chunks += chunk_count
            except Exception as e:
                logger.error(f"Error loading {file_meta.file_id}: {e}")

        logger.info(f"\n{'='*60}")
        logger.info(f"Loading Complete!")
        logger.info(f"{'='*60}")
        logger.info(f"Total documents: {len(self.manifest.files)}")
        logger.info(f"Total chunks stored: {total_chunks}")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Load documents into RedisVL")
    parser.add_argument(
        "--manifest-path",
        type=Path,
        required=True,
        help="Path to manifest.json"
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

    # Validate manifest exists
    if not args.manifest_path.exists():
        logger.error(f"Manifest not found: {args.manifest_path}")
        return

    # Load data
    loader = RedisLoader(manifest_path=args.manifest_path)
    loader.load_all()


if __name__ == "__main__":
    main()
