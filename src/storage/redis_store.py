"""RedisVL storage and indexing"""

from typing import List, Optional, Dict
from datetime import datetime

import redis
from redisvl.index import SearchIndex
from redisvl.query import VectorQuery
from redisvl.query.filter import Tag, Num, Text
from loguru import logger

from src.config import settings
from src.models import DocumentChunk, CompanyFeatures


class RedisVLStore:
    """Manages RedisVL indexes and data storage"""

    def __init__(self, redis_url: str = None):
        """
        Initialize Redis connection and indexes

        Args:
            redis_url: Redis connection URL (default from settings)
        """
        self.redis_url = redis_url or settings.redis_url
        self.client = redis.from_url(self.redis_url)

        # Initialize indexes
        self.doc_chunk_index = None
        self.company_features_index = None

    def create_document_chunk_index(self, overwrite: bool = False):
        """
        Create the document_chunks index for vector search

        Args:
            overwrite: Whether to overwrite existing index
        """
        schema = {
            "index": {
                "name": "document_chunks",
                "prefix": "doc:",
                "storage_type": "hash"
            },
            "fields": [
                {
                    "name": "company_id",
                    "type": "tag"
                },
                {
                    "name": "ticker",
                    "type": "tag"
                },
                {
                    "name": "doc_type",
                    "type": "tag"
                },
                {
                    "name": "section",
                    "type": "tag"
                },
                {
                    "name": "fiscal_year",
                    "type": "numeric"
                },
                {
                    "name": "published_date",
                    "type": "numeric"
                },
                {
                    "name": "language",
                    "type": "tag"
                },
                {
                    "name": "text",
                    "type": "text"
                },
                {
                    "name": "embedding",
                    "type": "vector",
                    "attrs": {
                        "dims": 1536,
                        "distance_metric": "cosine",
                        "algorithm": "hnsw",
                        "datatype": "float32"
                    }
                }
            ]
        }

        self.doc_chunk_index = SearchIndex.from_dict(schema)
        self.doc_chunk_index.set_client(self.client)

        if overwrite or not self.doc_chunk_index.exists():
            self.doc_chunk_index.create(overwrite=overwrite)
            logger.info("Created document_chunks index")
        else:
            logger.info("document_chunks index already exists")

    def create_company_features_index(self, overwrite: bool = False):
        """
        Create the company_features index for structured features

        Args:
            overwrite: Whether to overwrite existing index
        """
        schema = {
            "index": {
                "name": "company_features",
                "prefix": "feat:",
                "storage_type": "hash"
            },
            "fields": [
                {
                    "name": "company_id",
                    "type": "tag"
                },
                {
                    "name": "year",
                    "type": "numeric"
                },
                # Growth Quality
                {
                    "name": "revenue_cagr_3y",
                    "type": "numeric"
                },
                {
                    "name": "organic_growth_pct",
                    "type": "numeric"
                },
                # Profitability
                {
                    "name": "gross_margin_stability",
                    "type": "numeric"
                },
                {
                    "name": "operating_margin",
                    "type": "numeric"
                },
                # Capital Discipline
                {
                    "name": "roic",
                    "type": "numeric"
                },
                {
                    "name": "fcf_margin",
                    "type": "numeric"
                },
                # Textual signals
                {
                    "name": "risk_factor_expansion_delta",
                    "type": "numeric"
                },
                {
                    "name": "competitor_mentions_trend",
                    "type": "numeric"
                },
                {
                    "name": "pricing_power_language_score",
                    "type": "numeric"
                },
                {
                    "name": "narrative_tone_score",
                    "type": "numeric"
                },
                {
                    "name": "insider_trend_score",
                    "type": "numeric"
                },
                # Final scores stored as JSON text
                {
                    "name": "final_radar_scores",
                    "type": "text"
                }
            ]
        }

        self.company_features_index = SearchIndex.from_dict(schema)
        self.company_features_index.set_client(self.client)

        if overwrite or not self.company_features_index.exists():
            self.company_features_index.create(overwrite=overwrite)
            logger.info("Created company_features index")
        else:
            logger.info("company_features index already exists")

    def initialize_indexes(self, overwrite: bool = False):
        """
        Initialize both indexes

        Args:
            overwrite: Whether to overwrite existing indexes
        """
        self.create_document_chunk_index(overwrite=overwrite)
        self.create_company_features_index(overwrite=overwrite)

    def store_document_chunk(self, chunk: DocumentChunk) -> bool:
        """
        Store a document chunk in Redis

        Args:
            chunk: DocumentChunk object

        Returns:
            True if successful
        """
        try:
            # Convert to dict for storage
            data = {
                "company_id": chunk.company_id,
                "ticker": chunk.ticker,
                "doc_type": chunk.doc_type,
                "section": chunk.section,
                "fiscal_year": chunk.fiscal_year,
                "published_date": chunk.published_date,
                "language": chunk.language,
                "text": chunk.text,
                "source_file_id": chunk.source_file_id,
            }

            # Add embedding if present
            if chunk.embedding:
                data["embedding"] = chunk.embedding

            # Store in Redis with key pattern doc:{id}
            key = f"doc:{chunk.id}"
            self.client.hset(key, mapping=data)

            logger.debug(f"Stored chunk {chunk.id}")
            return True

        except Exception as e:
            logger.error(f"Error storing chunk {chunk.id}: {e}")
            return False

    def store_document_chunks(self, chunks: List[DocumentChunk]) -> int:
        """
        Store multiple document chunks in batch

        Args:
            chunks: List of DocumentChunk objects

        Returns:
            Number of chunks successfully stored
        """
        count = 0
        for chunk in chunks:
            if self.store_document_chunk(chunk):
                count += 1

        logger.info(f"Stored {count}/{len(chunks)} document chunks")
        return count

    def store_company_features(self, features: CompanyFeatures) -> bool:
        """
        Store company features in Redis

        Args:
            features: CompanyFeatures object

        Returns:
            True if successful
        """
        try:
            # Convert to dict for storage
            data = features.model_dump(exclude_none=True)

            # Convert final_radar_scores dict to JSON string
            if "final_radar_scores" in data and data["final_radar_scores"]:
                import json
                data["final_radar_scores"] = json.dumps(data["final_radar_scores"])

            # Store in Redis with key pattern feat:{company_id}:{year}
            key = f"feat:{features.company_id}:{features.year}"
            self.client.hset(key, mapping=data)

            logger.debug(f"Stored features for {features.company_id} ({features.year})")
            return True

        except Exception as e:
            logger.error(f"Error storing features for {features.company_id}: {e}")
            return False

    def search_chunks(
        self,
        query_embedding: List[float],
        company_id: Optional[str] = None,
        doc_type: Optional[str] = None,
        section: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        top_k: int = 5
    ) -> List[Dict]:
        """
        Search document chunks by vector similarity with optional filters

        Args:
            query_embedding: Query vector (1536 dims)
            company_id: Filter by company
            doc_type: Filter by document type
            section: Filter by section
            fiscal_year: Filter by fiscal year
            top_k: Number of results to return

        Returns:
            List of matching chunks with scores
        """
        # Build filter expression
        filters = []
        if company_id:
            filters.append(Tag("company_id") == company_id)
        if doc_type:
            filters.append(Tag("doc_type") == doc_type)
        if section:
            filters.append(Tag("section") == section)
        if fiscal_year:
            filters.append(Num("fiscal_year") == fiscal_year)

        # Create query
        query = VectorQuery(
            vector=query_embedding,
            vector_field_name="embedding",
            return_fields=["company_id", "ticker", "doc_type", "section", "text", "fiscal_year"],
            num_results=top_k
        )

        # Add filters if any
        if filters:
            filter_expression = filters[0]
            for f in filters[1:]:
                filter_expression = filter_expression & f
            query.set_filter(filter_expression)

        # Execute search
        results = self.doc_chunk_index.query(query)

        logger.info(f"Found {len(results)} chunks matching query")
        return results

    def get_company_features(self, company_id: str, year: int) -> Optional[CompanyFeatures]:
        """
        Retrieve company features for a specific year

        Args:
            company_id: Company identifier
            year: Fiscal year

        Returns:
            CompanyFeatures object or None
        """
        key = f"feat:{company_id}:{year}"
        data = self.client.hgetall(key)

        if not data:
            return None

        # Convert byte strings to regular strings
        data = {k.decode(): v.decode() for k, v in data.items()}

        # Parse final_radar_scores JSON
        if "final_radar_scores" in data and data["final_radar_scores"]:
            import json
            data["final_radar_scores"] = json.loads(data["final_radar_scores"])

        # Convert numeric fields
        numeric_fields = [
            "year", "revenue_cagr_3y", "organic_growth_pct", "gross_margin_stability",
            "operating_margin", "roic", "fcf_margin", "risk_factor_expansion_delta",
            "competitor_mentions_trend", "pricing_power_language_score",
            "narrative_tone_score", "insider_trend_score"
        ]

        for field in numeric_fields:
            if field in data and data[field]:
                data[field] = float(data[field])

        return CompanyFeatures(**data)

    def health_check(self) -> bool:
        """
        Check if Redis connection is healthy

        Returns:
            True if connected
        """
        try:
            self.client.ping()
            logger.info("Redis connection healthy")
            return True
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            return False
