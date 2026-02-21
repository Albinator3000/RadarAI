"""Data models for RadarAI"""

from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, HttpUrl


class Company(BaseModel):
    """Company metadata"""
    company_id: str
    company_name: str
    ticker: str
    exchange: str
    country: str
    cik: Optional[str] = None  # US companies only
    ir_url: HttpUrl
    press_url: HttpUrl
    sustainability_url: HttpUrl


class DocumentMetadata(BaseModel):
    """Metadata for a single document in the data package"""
    file_id: str
    company_id: str
    company_name: str
    ticker: str
    doc_type: Literal[
        "10k", "10q", "8k", "def14a", "annual_report", "interim_report",
        "press_release", "earnings_slides", "transcript", "sustainability"
    ]
    fiscal_period_end: Optional[str] = None
    filing_date: Optional[str] = None
    doc_date: Optional[str] = None
    source_type: Literal["primary", "secondary", "licensed"]
    source_url: str
    fetched_at_utc: datetime
    byte_size: int
    mime_type: str
    sha256: str
    redistributable: bool
    confidence: float = Field(ge=0.0, le=1.0)
    extracted_text_path: Optional[str] = None
    table_csv_paths: List[str] = Field(default_factory=list)
    extraction_notes: Optional[str] = None
    language: str = "en"


class PackageMetadata(BaseModel):
    """Metadata for the entire data package"""
    as_of: str
    since: str
    peer_set: str
    build_version: str
    build_host: Optional[str] = None
    python_version: Optional[str] = None
    git_commit: Optional[str] = None
    license_notes: Optional[str] = None


class Manifest(BaseModel):
    """Complete manifest for the data package"""
    package: PackageMetadata
    files: List[DocumentMetadata]


class DocumentChunk(BaseModel):
    """A chunk of text from a document for RedisVL storage"""
    id: str
    company_id: str
    ticker: str
    doc_type: str
    fiscal_year: int
    section: str
    text: str
    embedding: Optional[List[float]] = None
    published_date: int  # Unix timestamp
    language: str = "en"
    source_file_id: str


class CompanyFeatures(BaseModel):
    """Derived features for a company stored in RedisVL"""
    company_id: str
    year: int
    # Growth Quality
    revenue_cagr_3y: Optional[float] = None
    organic_growth_pct: Optional[float] = None
    # Profitability
    gross_margin_stability: Optional[float] = None
    operating_margin: Optional[float] = None
    # Capital Discipline
    roic: Optional[float] = None
    fcf_margin: Optional[float] = None
    # Textual signals
    risk_factor_expansion_delta: Optional[float] = None
    competitor_mentions_trend: Optional[float] = None
    pricing_power_language_score: Optional[float] = None
    narrative_tone_score: Optional[float] = None
    insider_trend_score: Optional[float] = None
    # Final radar scores
    final_radar_scores: Optional[dict] = None
