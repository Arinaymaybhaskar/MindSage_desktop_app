import type { Relationship } from "../../types/People";

export function relationshipLabel(r: Relationship | null | undefined): string {
  if (!r) return "";
  return r[0].toUpperCase() + r.slice(1);
}

/**
 * Words for a feeling score. They describe what the writer wrote, never the
 * person or the relationship.
 */
export function valenceLabel(v: number | null | undefined): string {
  if (v === null || v === undefined) return "No feeling noted";
  if (v >= 2) return "Very positive";
  if (v >= 1) return "Positive";
  if (v <= -2) return "Very negative";
  if (v <= -1) return "Negative";
  return "Neutral";
}

export const VALENCE_OPTIONS = [2, 1, 0, -1, -2] as const;

/** Mirrors TREND_MIN_MENTIONS in electron/people/insights.js. */
export const TREND_MIN = 3;
