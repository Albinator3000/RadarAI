
# Company Intelligence Radar App (CSV + PDF → Scores → JSON → A2UI Radar UI)

## Goal

Build a four-part demo app that:
1) Ingests CSVs (structured metrics) and PDFs (10-Ks / PDM reports / filings / transcripts),
2) Extracts structured + textual signals,
3) Scores each company on a common 0–100 scale across radar dimensions,
4) Outputs JSON consumed by A2UI to render an overlaid radar chart comparing 3–5 fashion companies.

---

# Core Radar Dimensions

1. Growth Quality  
2. Revenue Durability  
3. Profitability & Unit Economics  
4. Capital Discipline  
5. Competitive Positioning  
6. Narrative & Tone Momentum  
7. Governance & Insider Alignment  
8. Expectations vs Reality (Asymmetry)  
9. Structural Risk Exposure  

---

# Architecture Overview (4 Components)

## Component A — Data Ingestion
- Load CSV files (financials, estimates, ownership)
- Extract text from PDFs (10-K, transcripts, PDM reports)
- Normalize to canonical company schema

## Component B — Feature Extraction
- Structured ratios and trends from CSV
- Textual signals from filings:
  - Risk factor expansion
  - Competitor mentions
  - Pricing power language
  - Tone shift via LLM scoring

## Component C — Scoring & Normalization
- Normalize features within peer set (fashion industry)
- Convert to 0–100 percentile scale
- Weight sub-signals into category scores

## Component D — JSON + A2UI Rendering
- Backend outputs radar JSON
- Frontend overlays multiple company radar charts in distinct colors

---

# Radar Category Definitions & Sub-Signals

## 1️⃣ Growth Quality
- Revenue CAGR (3Y)
- Organic vs acquisition growth
- Segment consistency
- Customer concentration trend

## 2️⃣ Revenue Durability
- Net revenue retention
- Contract length disclosures
- Recurring revenue %
- Churn indicators
- Switching cost language (10-K)

## 3️⃣ Profitability & Unit Economics
- Gross margin stability
- Contribution margin
- Operating leverage trend
- Cohort profitability (if disclosed)

## 4️⃣ Capital Discipline
- ROIC
- FCF margin
- SBC trend
- Buyback vs dilution behavior
- M&A frequency and quality

## 5️⃣ Competitive Positioning
- Market share disclosures
- Competitor mentions trend (10-K risk section)
- Pricing power language frequency
- Patent / innovation mentions
- Hiring acceleration in key verticals

## 6️⃣ Narrative & Tone Momentum
- Earnings call tone shift (LLM-scored)
- Risk factor expansion delta
- News sentiment trend
- Forward guidance tone vs prior quarter

## 7️⃣ Governance & Insider Alignment
- Insider buying/selling trend
- Executive turnover
- Auditor changes
- Litigation mentions trend
- Regulatory investigation mentions

## 8️⃣ Expectation vs Reality (Asymmetry)
- Analyst estimate dispersion
- Earnings surprise consistency
- Implied growth vs realized growth
- Short interest trend
- Options-implied move vs historical move

## 9️⃣ Structural Risk Exposure
- Geographic revenue concentration
- Supplier dependency disclosures
- Commodity sensitivity
- FX exposure
- Top customer revenue %

---

# JSON Output Structure

{
  "dimensions": [...],
  "companies": [
    {
      "label": "Nike",
      "scores": {
        "Growth Quality": 74,
        "Revenue Durability": 62,
        "...": 80
      }
    }
  ]
}

---

# Demo Industry

Fashion industry (US + International)

Example companies:
- Nike
- Lululemon
- Under Armour
- Inditex
- H&M
- adidas
- Fast Retailing

---

# Next Steps

1. Implement ingestion layer
2. Build feature extraction modules
3. Implement scoring engine
4. Output radar JSON
5. Integrate with A2UI frontend
