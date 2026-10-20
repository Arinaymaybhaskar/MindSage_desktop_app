import type { TrendPoint } from "../../types/People";

interface FeelingSparklineProps {
  points: TrendPoint[];
  width?: number;
  height?: number;
  /** When set, each point is a button that opens the entry it came from. */
  onPointClick?: (entryId: number) => void;
}

/**
 * The small feeling trend line. Values run from -2 to 2; the dashed line is
 * neutral. Nothing is drawn until the main process sends at least three
 * points, so one wrong score never becomes a "trend".
 */
export default function FeelingSparkline({
  points,
  width = 120,
  height = 32,
  onPointClick,
}: FeelingSparklineProps) {
  if (points.length < 2) return null;
  const pad = 4;
  const x = (i: number) =>
    pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad + ((2 - v) / 4) * (height - pad * 2);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`)
    .join(" ");
  const last = points[points.length - 1].value;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Feeling trend, most recent ${last > 0.25 ? "positive" : last < -0.25 ? "negative" : "neutral"}`}
      className="overflow-visible"
    >
      <line
        x1={pad}
        x2={width - pad}
        y1={y(0)}
        y2={y(0)}
        strokeDasharray="2 3"
        className="stroke-border-light dark:stroke-border-dark"
        strokeWidth={1}
      />
      <path
        d={d}
        fill="none"
        className="stroke-light1 dark:stroke-dark1"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={`${p.entryId}-${i}`}
          cx={x(i)}
          cy={y(p.value)}
          r={onPointClick ? 3.5 : 2}
          className={`fill-light1 dark:fill-dark1 ${onPointClick ? "cursor-pointer hover:opacity-70" : ""}`}
          onClick={onPointClick ? () => onPointClick(p.entryId) : undefined}
        >
          <title>{new Date(p.date).toLocaleDateString()}</title>
        </circle>
      ))}
    </svg>
  );
}
