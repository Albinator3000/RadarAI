/**
 * Seed radar scores for 7 fashion companies.
 *
 * Scores are 0-100 percentile rankings within the fashion peer group,
 * derived from publicly available financial data and qualitative signals
 * per the weights.yaml scoring framework.
 *
 * These represent a realistic snapshot as of Feb 2026 for demo purposes.
 */

export interface CompanyRadarScores {
  label: string;
  ticker: string;
  scores: Record<string, number>;
  color: string;
  borderColor: string;
}

export interface RadarData {
  dimensions: string[];
  companies: CompanyRadarScores[];
  metadata: {
    as_of: string;
    peer_group: string;
    score_scale: string;
    version: string;
  };
}

export const RADAR_DIMENSIONS = [
  "Growth Quality",
  "Revenue Durability",
  "Profitability & Unit Economics",
  "Capital Discipline",
  "Competitive Positioning",
  "Narrative & Tone Momentum",
  "Governance & Alignment",
  "Expectation vs Reality",
  "Structural Risk Exposure",
];

export const COMPANY_COLORS: Record<string, { bg: string; border: string }> = {
  Nike:             { bg: "rgba(245, 130, 32, 0.25)",  border: "#F58220" },
  Lululemon:        { bg: "rgba(190, 30, 45, 0.25)",   border: "#BE1E2D" },
  "Under Armour":   { bg: "rgba(26, 26, 26, 0.20)",    border: "#1A1A1A" },
  Inditex:          { bg: "rgba(0, 114, 198, 0.25)",    border: "#0072C6" },
  "H&M":            { bg: "rgba(224, 17, 17, 0.25)",    border: "#E01111" },
  adidas:           { bg: "rgba(0, 0, 0, 0.20)",        border: "#000000" },
  "Fast Retailing": { bg: "rgba(255, 0, 0, 0.25)",      border: "#FF0000" },
};

export const RADAR_DATA: RadarData = {
  dimensions: RADAR_DIMENSIONS,
  metadata: {
    as_of: "2026-02-21",
    peer_group: "fashion_global",
    score_scale: "0-100",
    version: "0.1.0",
  },
  companies: [
    {
      label: "Nike",
      ticker: "NKE",
      color: COMPANY_COLORS["Nike"].bg,
      borderColor: COMPANY_COLORS["Nike"].border,
      scores: {
        "Growth Quality": 52,
        "Revenue Durability": 82,
        "Profitability & Unit Economics": 78,
        "Capital Discipline": 75,
        "Competitive Positioning": 88,
        "Narrative & Tone Momentum": 38,
        "Governance & Alignment": 65,
        "Expectation vs Reality": 42,
        "Structural Risk Exposure": 55,
      },
    },
    {
      label: "Lululemon",
      ticker: "LULU",
      color: COMPANY_COLORS["Lululemon"].bg,
      borderColor: COMPANY_COLORS["Lululemon"].border,
      scores: {
        "Growth Quality": 85,
        "Revenue Durability": 78,
        "Profitability & Unit Economics": 92,
        "Capital Discipline": 88,
        "Competitive Positioning": 76,
        "Narrative & Tone Momentum": 72,
        "Governance & Alignment": 70,
        "Expectation vs Reality": 65,
        "Structural Risk Exposure": 68,
      },
    },
    {
      label: "Under Armour",
      ticker: "UAA",
      color: COMPANY_COLORS["Under Armour"].bg,
      borderColor: COMPANY_COLORS["Under Armour"].border,
      scores: {
        "Growth Quality": 25,
        "Revenue Durability": 35,
        "Profitability & Unit Economics": 30,
        "Capital Discipline": 32,
        "Competitive Positioning": 40,
        "Narrative & Tone Momentum": 28,
        "Governance & Alignment": 45,
        "Expectation vs Reality": 50,
        "Structural Risk Exposure": 42,
      },
    },
    {
      label: "Inditex",
      ticker: "ITX.MC",
      color: COMPANY_COLORS["Inditex"].bg,
      borderColor: COMPANY_COLORS["Inditex"].border,
      scores: {
        "Growth Quality": 80,
        "Revenue Durability": 85,
        "Profitability & Unit Economics": 82,
        "Capital Discipline": 90,
        "Competitive Positioning": 84,
        "Narrative & Tone Momentum": 78,
        "Governance & Alignment": 75,
        "Expectation vs Reality": 72,
        "Structural Risk Exposure": 60,
      },
    },
    {
      label: "H&M",
      ticker: "HMB.ST",
      color: COMPANY_COLORS["H&M"].bg,
      borderColor: COMPANY_COLORS["H&M"].border,
      scores: {
        "Growth Quality": 40,
        "Revenue Durability": 55,
        "Profitability & Unit Economics": 45,
        "Capital Discipline": 50,
        "Competitive Positioning": 60,
        "Narrative & Tone Momentum": 48,
        "Governance & Alignment": 62,
        "Expectation vs Reality": 55,
        "Structural Risk Exposure": 38,
      },
    },
    {
      label: "adidas",
      ticker: "ADS.DE",
      color: COMPANY_COLORS["adidas"].bg,
      borderColor: COMPANY_COLORS["adidas"].border,
      scores: {
        "Growth Quality": 68,
        "Revenue Durability": 70,
        "Profitability & Unit Economics": 58,
        "Capital Discipline": 55,
        "Competitive Positioning": 75,
        "Narrative & Tone Momentum": 82,
        "Governance & Alignment": 68,
        "Expectation vs Reality": 78,
        "Structural Risk Exposure": 50,
      },
    },
    {
      label: "Fast Retailing",
      ticker: "9983.T",
      color: COMPANY_COLORS["Fast Retailing"].bg,
      borderColor: COMPANY_COLORS["Fast Retailing"].border,
      scores: {
        "Growth Quality": 90,
        "Revenue Durability": 72,
        "Profitability & Unit Economics": 75,
        "Capital Discipline": 82,
        "Competitive Positioning": 70,
        "Narrative & Tone Momentum": 68,
        "Governance & Alignment": 58,
        "Expectation vs Reality": 80,
        "Structural Risk Exposure": 45,
      },
    },
  ],
};

/** Category weights from weights.yaml */
export const CATEGORY_WEIGHTS: Record<string, number> = {
  "Growth Quality": 0.12,
  "Revenue Durability": 0.12,
  "Profitability & Unit Economics": 0.14,
  "Capital Discipline": 0.12,
  "Competitive Positioning": 0.12,
  "Narrative & Tone Momentum": 0.10,
  "Governance & Alignment": 0.10,
  "Expectation vs Reality": 0.10,
  "Structural Risk Exposure": 0.08,
};

/** Compute a weighted composite score for a company */
export function computeComposite(scores: Record<string, number>): number {
  let total = 0;
  let weightSum = 0;
  for (const [dim, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    if (scores[dim] !== undefined) {
      total += scores[dim] * weight;
      weightSum += weight;
    }
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 0;
}
