# RadarAI - Company Intelligence Radar System

A comprehensive data intelligence system that ingests financial filings, earnings materials, and sustainability reports to score companies across 9 analytical dimensions using AI-powered analysis.

## Quick Start

### 1. Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env
```

### 2. Configure Redis

```bash
# Install Redis (macOS)
brew install redis

# Start Redis
redis-server

# Or use Redis Cloud (recommended for production)
# Update REDIS_URL in .env
```

### 3. Build Data Package

```bash
# Build full data package for all 8 companies
python scripts/build_data_package.py

# Or build for specific companies
python scripts/build_data_package.py --companies nike lululemon under_armour
```

### 4. Load into RedisVL

```bash
python scripts/load_to_redis.py --manifest-path output/fashion_demo_package_2026-02-21/manifest.json
```

## Project Structure

```
RadarAI/
├── src/
│   ├── ingestion/          # Data fetching modules
│   │   ├── edgar.py        # SEC EDGAR fetcher
│   │   └── ir_sites.py     # Company IR site fetcher
│   ├── extraction/         # PDF/document processing
│   │   └── pdf_extractor.py
│   ├── storage/            # RedisVL integration
│   │   └── redis_store.py
│   ├── scoring/            # (Future) Scoring engines
│   ├── models.py           # Pydantic data models
│   ├── config.py           # Configuration management
│   └── utils.py            # Utility functions
├── scripts/
│   ├── build_data_package.py  # Main orchestration script
│   └── load_to_redis.py       # RedisVL loader
├── config/
│   ├── companies.yaml      # Company definitions
│   └── weights.yaml        # Scoring weights (moved from context/)
├── context/                # Documentation
│   ├── company_intelligence_radar_app.md
│   └── CLAUDE.md           # AI assistant guide
├── data/                   # Data specs
│   ├── data.md
│   └── redisvl_architecture.md
├── output/                 # Generated data packages
├── tests/                  # Unit tests
├── requirements.txt
├── .env.example
└── README.md
```

## Data Sources

### US Companies (SEC EDGAR)
- **Nike (NKE)**
- **Lululemon (LULU)**
- **Under Armour (UAA)**
- **VF Corporation (VFC)**
- **Ralph Lauren (RL)**

Source: https://www.sec.gov/edgar/
Filings: 10-K, 10-Q, 8-K, DEF 14A

### International Companies (IR Sites)
- **Inditex (ITX.MC)** - Spain
- **H&M (HMB.ST)** - Sweden
- **adidas (ADS.DE)** - Germany

Source: Company investor relations portals
Reports: Annual reports, interim reports, sustainability reports

## Radar Dimensions

The system scores companies on 9 dimensions (0-100 scale):

| Dimension | Weight | Key Signals |
|-----------|--------|-------------|
| **Growth Quality** | 12% | Revenue CAGR, organic growth, segment consistency |
| **Revenue Durability** | 12% | Net retention, recurring revenue, switching costs |
| **Profitability & Unit Economics** | 14% | Margin stability, contribution margin, operating leverage |
| **Capital Discipline** | 12% | ROIC, FCF margin, share buyback behavior |
| **Competitive Positioning** | 12% | Market share, pricing power, innovation mentions |
| **Narrative & Tone Momentum** | 10% | Earnings tone, risk factor expansion, sentiment |
| **Governance & Alignment** | 10% | Insider trading, executive turnover, litigation |
| **Expectation vs Reality** | 10% | Analyst dispersion, earnings surprises, asymmetry |
| **Structural Risk Exposure** | 8% | Geographic concentration, supplier dependency |

See `context/weights.yaml` for detailed sub-signal weightings.

## Architecture

### Component A: Data Ingestion
- `src/ingestion/edgar.py` - SEC EDGAR filings fetcher
- `src/ingestion/ir_sites.py` - Company IR site scraper
- Respects rate limits and robots.txt
- Generates SHA-256 checksums for integrity

### Component B: Feature Extraction
- `src/extraction/pdf_extractor.py` - PDF text/table extraction
- Section detection (Risk Factors, MD&A, Competition)
- Table extraction to CSV (Camelot + pdfplumber)
- Text chunking for semantic analysis

### Component C: Storage Layer (RedisVL)
- `src/storage/redis_store.py` - RedisVL integration
- Two indexes:
  - `document_chunks` - Vector search (1536-dim embeddings)
  - `company_features` - Structured metrics
- Hybrid filtering (semantic + metadata)

### Component D: Scoring & Output (Future)
- Normalize features within peer group
- Weight aggregation per weights.yaml
- JSON output for A2UI radar visualization

## Usage Examples

### Build Data Package for Single Company

```bash
python scripts/build_data_package.py --companies nike --log-level DEBUG
```

### Search Document Chunks

```python
from src.storage.redis_store import RedisVLStore
from openai import OpenAI

# Initialize
store = RedisVLStore()
client = OpenAI()

# Generate query embedding
query = "pricing power and competitive advantages"
response = client.embeddings.create(
    model="text-embedding-ada-002",
    input=query
)
query_embedding = response.data[0].embedding

# Search Nike's risk factors
results = store.search_chunks(
    query_embedding=query_embedding,
    company_id="nike",
    section="risk_factors",
    top_k=5
)

for result in results:
    print(f"Score: {result['score']:.4f}")
    print(f"Text: {result['text'][:200]}...")
    print()
```

### Extract Company Features

```python
from src.storage.redis_store import RedisVLStore

store = RedisVLStore()

# Get Nike's 2025 features
features = store.get_company_features("nike", 2025)

print(f"ROIC: {features.roic}")
print(f"Revenue CAGR: {features.revenue_cagr_3y}")
print(f"Tone Score: {features.narrative_tone_score}")
```

## Data Package Output

Each build creates a timestamped package:

```
output/fashion_demo_package_2026-02-21/
├── manifest.json              # Complete metadata
├── checksums.sha256           # File integrity hashes
├── README.md                  # Package documentation
├── companies/
│   ├── nike/
│   │   ├── source/
│   │   │   ├── sec_edgar/    # Original filings
│   │   │   └── ir/           # IR documents
│   │   └── extracted/         # (After extraction)
│   └── [other companies...]
└── logs/
    └── build.log
```

## Configuration

### Environment Variables (.env)

```bash
# Redis
REDIS_URL=redis://localhost:6379

# OpenAI (for embeddings)
OPENAI_API_KEY=sk-...

# Data fetching
USER_AGENT=RadarAI/0.1.0 (Research; your-email@example.com)
EDGAR_RATE_LIMIT=2    # requests/sec
IR_RATE_LIMIT=1       # requests/sec

# Build
AS_OF_DATE=2026-02-21
SINCE_DATE=2025-02-21
BUILD_VERSION=0.1.0
```

### Company Configuration (config/companies.yaml)

Add new companies by extending the YAML:

```yaml
companies:
  - company_id: new_company
    company_name: New Company
    ticker: NEWCO
    exchange: NYSE
    country: US
    cik: "0001234567"
    ir_url: https://investor.newcompany.com/
    press_url: https://investor.newcompany.com/press/
    sustainability_url: https://newcompany.com/sustainability
```

## Development

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-cov

# Run tests
pytest tests/

# With coverage
pytest --cov=src tests/
```

### Code Style

```bash
# Install development dependencies
pip install black flake8 mypy

# Format code
black src/ scripts/

# Lint
flake8 src/ scripts/

# Type check
mypy src/
```

## Roadmap

- [x] Data ingestion (SEC EDGAR + IR sites)
- [x] PDF extraction (text, sections, tables)
- [x] RedisVL integration
- [ ] LLM-based textual signal extraction
  - [ ] Tone analysis
  - [ ] Risk factor expansion tracking
  - [ ] Pricing power language detection
- [ ] Structured signal calculation
  - [ ] Financial ratio computation
  - [ ] Trend analysis
- [ ] Scoring engine
  - [ ] Normalization (robust z-score)
  - [ ] Weighted aggregation
- [ ] JSON output for A2UI
- [ ] API server (FastAPI)
- [ ] Web UI dashboard

## Contributing

See `context/CLAUDE.md` for detailed development guidelines and project philosophy.

## License

This project is for research and educational purposes. Respect data source terms of service:
- SEC EDGAR: Public domain
- Company IR sites: Check individual terms
- Third-party data: Obtain appropriate licenses

## Support

For issues or questions:
1. Check existing documentation in `context/` and `data/`
2. Review the CLAUDE.md guide
3. Open an issue with detailed context

---

Built with Python, Redis, OpenAI, and data from the SEC EDGAR and company investor relations portals.
