# RedisVL Architecture for Company Intelligence Radar App

## Objective

Use RedisVL (Redis Vector Library) as the unified storage layer for:

- 10-K and annual report text chunks
- Earnings call transcripts and press releases
- Extracted section-level metadata
- Embeddings for semantic search
- Derived structured scoring signals
- Company-level radar feature outputs

---

# Why RedisVL

RedisVL enables:

- Vector similarity search
- Hybrid structured + semantic filtering
- Metadata filtering (company, year, doc_type)
- Fast retrieval for scoring engines
- Production-ready scaling

Ideal for:
- Risk factor semantic drift detection
- Competitive mention analysis
- Narrative momentum scoring
- Section-level 10-K retrieval

---

# High-Level Architecture

Backend:
- PDF ingestion → text extraction
- Chunking (by section or semantic window)
- Embedding generation
- RedisVL indexing

Scoring Layer:
- Retrieve relevant chunks
- Compute signals
- Aggregate into radar dimensions

Frontend:
- Radar JSON from scoring engine
- Render via A2UI

---

# RedisVL Index Schema Design

We maintain two indexes:

1. document_chunks (vector index)
2. company_features (structured feature index)

---

## Document Chunk Index

Each chunk represents a section of a filing or report.

Schema Fields:

- id (string)
- company_id (tag)
- ticker (tag)
- doc_type (tag)  # 10k, 10q, annual_report, press_release
- fiscal_year (numeric)
- section (tag)   # risk_factors, mdna, competition
- text (text)
- embedding (vector, 1536 dims)
- published_date (numeric timestamp)
- language (tag)

Example Index Creation (Python):

```python
from redisvl.index import SearchIndex

index = SearchIndex.from_dict({
    "name": "document_chunks",
    "prefix": "doc:",
    "storage_type": "hash",
    "fields": [
        {"name": "company_id", "type": "tag"},
        {"name": "doc_type", "type": "tag"},
        {"name": "section", "type": "tag"},
        {"name": "text", "type": "text"},
        {"name": "fiscal_year", "type": "numeric"},
        {"name": "embedding", "type": "vector",
         "attrs": {
             "dims": 1536,
             "distance_metric": "cosine",
             "algorithm": "hnsw"
         }}
    ]
})

index.create(overwrite=True)
```

---

## Company Feature Index

Stores derived metrics used in radar scoring.

Fields:

- company_id
- year
- revenue_cagr_3y
- gross_margin_stability
- risk_factor_expansion_delta
- insider_trend_score
- narrative_tone_score
- final_radar_scores (JSON string)

---

# Data Ingestion Flow

1. Load PDFs (10-K, annual report)
2. Extract text
3. Split into logical sections
4. Chunk into ~500–1000 token windows
5. Generate embeddings
6. Store each chunk in RedisVL

---

# Chunking Strategy

Preferred chunking:

- Split by headings (Risk Factors, MD&A, Competition)
- Within section → sliding window token chunks
- Store section name in metadata

---

# Query Examples

## Retrieve Risk Factors for Nike

```python
results = index.query(
    vector=my_embedding,
    filter="company_id == 'nike' AND section == 'risk_factors'",
    num_results=5
)
```

## Compare Competition Sections Across Companies

```python
filter = "section == 'competition' AND fiscal_year == 2025"
results = index.query(vector=query_embedding, filter=filter)
```

---

# Supporting Radar Dimensions

RedisVL powers:

- Narrative & Tone Momentum
- Competitive Positioning
- Structural Risk Exposure
- Risk Factor Expansion Tracking
- Switching Cost Language Detection

---

# Storage Considerations

Estimated for 8 companies:

- 3–5 filings per company
- 100–300 chunks per filing
- ~5,000–10,000 chunks total

Memory footprint manageable under Redis Cloud standard tier.

---

# Versioning Strategy

Store:

- scoring_version
- embedding_model_version
- chunking_strategy_version

---

# Final System Flow

PDF → Extract → Chunk → Embed → RedisVL  
RedisVL → Query → Score → JSON → A2UI Radar
