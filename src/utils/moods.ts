export interface Mood {
  level: number;
  label: string;
  top: string;
  bottom: string;
}

export const MOODS: Mood[] = [
  { level: 1, label: "Struggling", top: "#7f1d1d", bottom: "#450a0a" },
  { level: 2, label: "Low", top: "#b45309", bottom: "#78350f" },
  { level: 3, label: "Neutral", top: "#78716c", bottom: "#44403c" },
  { level: 4, label: "Good", top: "#365314", bottom: "#1a2e05" },
  { level: 5, label: "Great", top: "#166534", bottom: "#052e16" },
];

export function getMood(level: number): Mood {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  return MOODS[clamped - 1];
}
