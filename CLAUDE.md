# CLAUDE.md - RadarAI Project Guide

## Project Overview

RadarAI is a Company Intelligence Radar application that ingests financial data from multiple sources (CSVs and PDFs), extracts structured and textual signals, scores companies across 9 analytical dimensions, and outputs JSON for radar chart visualization using A2UI.

**Target Industry**: Fashion (Nike, Lululemon, Under Armour, Inditex, H&M, adidas, Fast Retailing)

**Score Scale**: 0-100 percentile ranking within peer group

## Core Philosophy

This project prioritizes **structurally predictive metrics** that signal long-term compounding potential:
- ROIC, revenue durability, and margin stability are weighted most heavily
- Capital allocation discipline and competitive advantage indicators are critical
- Narrative and positioning factors are informative but secondary to core economics
- Focus on durable cash-flow generation over short-term noise

## Architecture Components

### Component A — Data Ingestion
- Load CSV files (financials, estimates, ownership data)
- Extract text from PDFs (10-K filings, earnings transcripts, PDM reports)
- Normalize data to canonical company schema

### Component B — Feature Extraction
- **Structured signals**: Financial ratios and trends from CSV data
- **Textual signals** from filings:
  - Risk factor expansion analysis
  - Competitor mention frequency
  - Pricing power language detection
  - Tone shift analysis via LLM scoring

### Component C — Scoring & Normalization
- Normalize features within peer set (fashion industry)
- Convert to 0-100 percentile scale using robust z-score method
- Weight sub-signals into category scores per weights.yaml
- Handle missing data via reweighting strategy

### Component D — JSON Output & Visualization
- Backend outputs structured radar JSON
- Frontend (A2UI) overlays multiple company radar charts
- Distinct colors per company for comparison

## Radar Dimensions (9 Categories)

| Dimension | Weight | Focus |
|-----------|--------|-------|
| **Growth Quality** | 12% | Revenue CAGR, organic growth, segment consistency |
| **Revenue Durability** | 12% | Retention, recurring revenue, switching costs |
| **Profitability & Unit Economics** | 14% | Margin stability, contribution margin, operating leverage |
| **Capital Discipline** | 12% | ROIC, FCF margin, buyback behavior, M&A quality |
| **Competitive Positioning** | 12% | Market share, pricing power, innovation mentions |
| **Narrative & Tone Momentum** | 10% | Earnings call tone, risk factor expansion, sentiment |
| **Governance & Alignment** | 10% | Insider trading, executive turnover, litigation |
| **Expectation vs Reality** | 10% | Analyst dispersion, earnings surprises, asymmetry |
| **Structural Risk Exposure** | 8% | Geographic/supplier concentration, commodity sensitivity |

See `weights.yaml` for detailed sub-signal weightings within each category.

## Key Files

### `/weights.yaml`
**Purpose**: Complete scoring configuration
- Category weights (sum to 1.0)
- Sub-signal definitions and weights
- Directionality (higher_better vs lower_better)
- Normalization parameters (robust_zscore, clamp_std: 3)

**When modifying**:
- Ensure category weights sum to 1.0
- Verify signal weights within each category sum to 1.0
- Maintain direction consistency with scoring logic

### `/company_intelligence_radar_app.md`
**Purpose**: Detailed architecture specification
- Component breakdown
- Data flow diagrams
- Signal definitions
- JSON output schema
- Implementation roadmap

### `/README.md`
**Purpose**: Weighting philosophy and investment thesis
- Explains why certain metrics are prioritized
- Documents the low-frequency investor perspective
- Rationale for structural predictiveness

## JSON Output Schema

```json
{
  "dimensions": [
    "Growth Quality",
    "Revenue Durability",
    "Profitability & Unit Economics",
    "Capital Discipline",
    "Competitive Positioning",
    "Narrative & Tone Momentum",
    "Governance & Alignment",
    "Expectation vs Reality",
    "Structural Risk Exposure"
  ],
  "companies": [
    {
      "label": "Nike",
      "scores": {
        "Growth Quality": 74,
        "Revenue Durability": 62,
        "Profitability & Unit Economics": 80,
        "Capital Discipline": 68,
        "Competitive Positioning": 85,
        "Narrative & Tone Momentum": 55,
        "Governance & Alignment": 72,
        "Expectation vs Reality": 60,
        "Structural Risk Exposure": 45
      }
    }
  ]
}
```

## Development Guidelines

### When Adding New Signals
1. Add signal definition to `weights.yaml` under appropriate category
2. Specify weight (ensure category totals remain 1.0)
3. Set direction (higher_better or lower_better)
4. Document data source and extraction logic
5. Update feature extraction module
6. Test normalization behavior

### When Adding New Categories
1. Define category in `weights.yaml` with weight < 1.0
2. Adjust existing category weights to maintain sum of 1.0
3. Define sub-signals with weights summing to 1.0
4. Update JSON output schema
5. Update A2UI radar dimensions array
6. Document investment rationale in README.md

### Normalization Strategy
- **Method**: `robust_zscore` (median-based, resistant to outliers)
- **Clamping**: ±3 standard deviations to handle extreme values
- **Missing Data**: `reweight` - redistribute weight among available signals
- **Peer Group**: `fashion_global` - normalize within industry cohort

### LLM Signal Extraction
For textual signals (tone shift, pricing power language, risk factor expansion):
- Use consistent prompting templates
- Score on 0-100 scale before normalization
- Document prompt versions for reproducibility
- Consider batching for efficiency
- Cache results to avoid re-processing

### Data Sources
- **10-K Filings**: Risk factors, business description, MD&A sections
- **Earnings Transcripts**: Management tone, guidance language
- **Financial CSVs**: Income statement, balance sheet, cash flow metrics
- **Estimates CSVs**: Analyst consensus, revision trends
- **Ownership CSVs**: Insider transactions, institutional holdings

## Working with This Codebase

### For Feature Implementation
1. Check `company_intelligence_radar_app.md` for specification
2. Review `weights.yaml` for scoring parameters
3. Maintain separation of concerns across 4 components
4. Test with sample companies before full peer set
5. Validate output JSON schema matches A2UI expectations

### For Scoring Logic Changes
1. Update `weights.yaml` first (single source of truth)
2. Ensure weights remain normalized (sum to 1.0)
3. Test with edge cases (missing data, outliers)
4. Document rationale in commit message
5. Consider impact on historical scores (versioning)

### For Data Pipeline Work
1. CSV ingestion should handle missing columns gracefully
2. PDF extraction should preserve structure for NLP tasks
3. Normalize company identifiers early (tickers, CIK, names)
4. Log data quality issues for manual review
5. Implement validation checks before scoring

## Next Implementation Steps

1. **Ingestion Layer**: CSV parser + PDF text extractor
2. **Feature Extraction**: Financial ratio calculator + LLM signal extractor
3. **Scoring Engine**: Normalization + weighted aggregation per weights.yaml
4. **JSON Output**: Schema validation + file export
5. **A2UI Integration**: API endpoint or file-based handoff

## Testing Strategy

- **Unit Tests**: Each signal calculation in isolation
- **Integration Tests**: Full pipeline with mock data
- **Validation Tests**: Score range checks (0-100), weight sums (1.0)
- **Regression Tests**: Compare scores across code versions
- **Industry Tests**: Verify fashion peer group rankings make intuitive sense

## Extensibility

This system is designed to support:
- **New industries**: Change `peer_group` in weights.yaml, adjust signals
- **Additional companies**: Extend ingestion to handle new data sources
- **Real-time updates**: Modify ingestion to consume APIs vs static files
- **Custom dimensions**: Add categories relevant to specific investment theses
- **Multi-timeframe**: Score companies across quarters/years for trend analysis

## Questions to Consider When Working

- Does this change affect score comparability across companies?
- Are we maintaining the philosophy of structural predictiveness?
- Does the normalization handle this edge case appropriately?
- Is this signal directionally correct (higher/lower is better)?
- Does the JSON output remain compatible with A2UI?
- Are we properly handling missing data without biasing scores?

## Resources

- **A2UI Documentation**: (Link to A2UI radar chart documentation if available)
- **SEC EDGAR**: Source for 10-K filings and transcripts
- **Peer Companies**: Nike, Lululemon, Under Armour, Inditex, H&M, adidas, Fast Retailing
