import React from "react";
import { motion } from "framer-motion";

/**
 * Current streak, drawn as a ring filling toward the personal best.
 *
 * The dashboard only ever showed "longest streak", which is a trophy rather
 * than a prompt - it says nothing about whether you are writing *now*. The
 * current run is the number that changes behaviour, so it leads, with the
 * record as the target the ring is filling toward.
 */
interface StreakRingProps {
  current: number;
  longest: number;
}

const SIZE = 104;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const StreakRing: React.FC<StreakRingProps> = ({ current, longest }) => {
  // Guard the divide: a brand-new account has no record to measure against.
  const target = Math.max(longest, 1);
  const progress = Math.min(1, current / target);
  const isRecord = current > 0 && current >= longest;

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative flex-shrink-0"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            className="fill-none stroke-tertiary-light dark:stroke-tertiary-dark"
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeLinecap="round"
            className={
              isRecord
                ? "fill-none stroke-success"
                : "fill-none stroke-light1 dark:stroke-dark4"
            }
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - progress) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-semibold leading-none tabular-nums text-text-light dark:text-text-dark">
            {current}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wider text-text-light-sub dark:text-text-dark-sub">
            {current === 1 ? "day" : "days"}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-text-light dark:text-text-dark">
          {current === 0
            ? "No streak yet"
            : isRecord
              ? "Your best run yet"
              : "Current streak"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-light-sub dark:text-text-dark-sub">
          {current === 0
            ? "Write today to start one."
            : isRecord
              ? `${longest} days and counting.`
              : `${longest - current} more to beat your record of ${longest}.`}
        </p>
      </div>
    </div>
  );
};

export default StreakRing;
