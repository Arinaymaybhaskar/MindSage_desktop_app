import React from "react";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday";
import { motion } from "framer-motion";
import clsx from "clsx";

dayjs.extend(isToday);

type MoodEntry = {
  date: string;
  mood_score: number; // Score from 1 to 5
};

interface Props {
  moodData: MoodEntry[];
  selectedDate: string | null;
}

// --- NEW: Using theme-based Tailwind classes for the color scale ---
const MOOD_COLOR_CLASSES = [
  "bg-danger",
  "bg-warning",
  "bg-light1 dark:bg-dark1",
  "bg-success/80",
  "bg-success",
];

const getMoodColorClass = (score: number): string => {
  const clampedScore = Math.max(1, Math.min(5, Math.round(score)));
  return MOOD_COLOR_CLASSES[clampedScore - 1];
};

const WeeklyMoodStrip: React.FC<Props> = ({ moodData, selectedDate }) => {
  const weekStart = dayjs(selectedDate || undefined).startOf("week");
  const days = Array.from({ length: 7 }).map((_, i) => weekStart.add(i, "day"));

  // Mood data processing logic remains the same...
  const moodByDate = new Map<string, number>();
  const scoresByDate = new Map<string, number[]>();

  moodData.forEach(({ date, mood_score }) => {
    const key = dayjs(date).format("YYYY-MM-DD");
    if (!scoresByDate.has(key)) {
      scoresByDate.set(key, []);
    }
    scoresByDate.get(key)!.push(mood_score);
  });

  for (const [key, scores] of scoresByDate.entries()) {
    const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    moodByDate.set(key, avg);
  }

  return (
    // --- CHANGE: Updated main container styling ---
    <div className="flex justify-between items-end gap-2 sm:gap-4 bg-secondary-light dark:bg-secondary-dark p-4 rounded-xl h-32">
      {days.map((day, index) => {
        const dateStr = day.format("YYYY-MM-DD");
        const moodScore = moodByDate.get(dateStr);
        const barHeight = moodScore ? `${(moodScore / 5) * 100}%` : "5%";
        // --- CHANGE: Switched to color classes ---
        const barColorClass = moodScore
          ? getMoodColorClass(moodScore)
          : "bg-tertiary-light dark:bg-tertiary-dark";
        const isSelected = day.isSame(selectedDate, "day");
        const isTodaysDate = day.isToday();

        return (
          <div
            key={dateStr}
            className="flex flex-col items-center h-full w-full group"
          >
            {/* Bar */}
            <div className="flex-grow w-full flex items-end justify-center">
              <motion.div
                // --- CHANGE: Updated ring and color classes ---
                className={clsx(
                  "w-3/4 max-w-md rounded-t-md relative",
                  barColorClass,
                  {
                    "ring-2 ring-offset-2 ring-info ring-offset-secondary-light dark:ring-offset-secondary-dark":
                      isSelected,
                  }
                )}
                style={{ height: barHeight }}
                initial={{ height: "5%" }}
                animate={{ height: barHeight }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                  delay: index * 0.05,
                }}
              >
                {moodScore && (
                  // --- CHANGE: Themed tooltip ---
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-base-dark text-text-dark text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {moodScore.toFixed(1)}
                  </div>
                )}
              </motion.div>
            </div>
            {/* Day Label */}
            <span
              // --- CHANGE: Themed text colors ---
              className={clsx("mt-2 text-xs font-semibold", {
                "text-dark1 dark:text-light1": isSelected || isTodaysDate,
                "text-text-light-sub dark:text-text-dark-sub":
                  !isSelected && !isTodaysDate,
              })}
            >
              {day.format("ddd")}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default WeeklyMoodStrip;
