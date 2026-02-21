"""Configuration management for RadarAI"""

import os
from pathlib import Path
from typing import List
import yaml
from pydantic_settings import BaseSettings
from loguru import logger

from src.models import Company


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    redis_url: str = "redis://localhost:6379"

    # Voyage AI
    voyage_api_key: str = ""
    embedding_model: str = "voyage-2"

    # Data fetching
    user_agent: str = "RadarAI/0.1.0 (Research Demo; contact@example.com)"
    edgar_rate_limit: float = 2.0  # requests per second
    ir_rate_limit: float = 1.0     # requests per second

    # Build configuration
    as_of_date: str = "2026-02-21"
    since_date: str = "2025-02-21"
    build_version: str = "0.1.0"

    # Paths
    project_root: Path = Path(__file__).parent.parent
    data_dir: Path = project_root / "data"
    output_dir: Path = project_root / "output"
    config_dir: Path = project_root / "config"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def load_companies(config_path: Path = None) -> List[Company]:
    """Load company configuration from YAML"""
    settings = Settings()

    if config_path is None:
        config_path = settings.config_dir / "companies.yaml"

    logger.info(f"Loading companies from {config_path}")

    with open(config_path, "r") as f:
        data = yaml.safe_load(f)

    companies = [Company(**company) for company in data["companies"]]
    logger.info(f"Loaded {len(companies)} companies")

    return companies


# Global settings instance
settings = Settings()
