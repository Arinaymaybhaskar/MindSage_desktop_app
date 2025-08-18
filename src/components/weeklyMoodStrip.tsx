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
  selectedDate: string | null; // The currently selected date from the calendar
}

// Consistent color scale from the MoodCalendar
const MOOD_COLOR_SCALE = [
  "#ef4444", // Mood 1
  "#f97316", // Mood 2
  "#eab308", // Mood 3
  "#84cc16", // Mood 4
  "#22c55e", // Mood 5
];

const getMoodColor = (score: number): string => {
  const clampedScore = Math.max(1, Math.min(5, Math.round(score)));
  return MOOD_COLOR_SCALE[clampedScore - 1];
};

const WeeklyMoodStrip: React.FC<Props> = ({ moodData, selectedDate }) => {
  const weekStart = dayjs(selectedDate || undefined).startOf("week");
  const days = Array.from({ length: 7 }).map((_, i) => weekStart.add(i, "day"));

  // A cleaner way to average mood scores for each day
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
    <div className="flex justify-between items-end gap-2 sm:gap-4 bg-white dark:bg-gray-800/50 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-32">
      {days.map((day, index) => {
        const dateStr = day.format("YYYY-MM-DD");
        const moodScore = moodByDate.get(dateStr);
        const barHeight = moodScore ? `${(moodScore / 5) * 100}%` : "5%";
        const barColor = moodScore ? getMoodColor(moodScore) : "#e5e7eb"; // Default gray
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
                className={clsx("w-3/4 max-w-md rounded-t-md relative", {
                  "ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-gray-800":
                    isSelected,
                })}
                style={{ backgroundColor: barColor, height: barHeight }}
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
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {moodScore.toFixed(1)}
                  </div>
                )}
              </motion.div>
            </div>
            {/* Day Label */}
            <span
              className={clsx("mt-2 text-xs font-semibold", {
                "text-indigo-600 dark:text-indigo-400":
                  isSelected || isTodaysDate,
                "text-gray-500 dark:text-gray-400":
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
