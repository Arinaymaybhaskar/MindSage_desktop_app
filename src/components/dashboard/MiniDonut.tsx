import React from "react";

/**
 * A small completed/total ring, sized to sit inside a stat tile.
 *
 * Hand-drawn rather than another Recharts `PieChart`: the chart version needed
 * a ResponsiveContainer, a legend and roughly 300px of height to render a
 * shape that carries one number. At this size the SVG is exact, costs nothing
 * to lay out, and cannot be clipped by its container.
 */
interface MiniDonutProps {
  completed: number;
  total: number;
  size?: number;
}

export const MiniDonut: React.FC<MiniDonutProps> = ({
  completed,
  total,
  size = 52,
}) => {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, completed / total) : 0;

  return (
    <svg
      width={size}
      height={size}
      className="-rotate-90 flex-shrink-0"
      role="img"
      aria-label={`${completed} of ${total} goals completed`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        className="fill-none stroke-tertiary-light dark:stroke-tertiary-dark"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeLinecap="round"
        className="fill-none stroke-success"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - ratio)}
      />
    </svg>
  );
};

export default MiniDonut;
