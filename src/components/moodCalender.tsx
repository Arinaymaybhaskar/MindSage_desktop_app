import React, { useState, useMemo } from "react";
import dayjs, { Dayjs } from "dayjs";
import isToday from "dayjs/plugin/isToday";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

dayjs.extend(isToday);

type MoodEntry = {
  date: string; // ISO format
  mood_score: number; // **Score from 1 to 5**
};

type Props = {
  moodData: MoodEntry[];
  onDateSelect?: (date: string | null) => void;
  selectedDate?: string | null;
};

// A 5-step color scale for the heatmap
const MOOD_COLOR_SCALE = [
  "#ef4444", // Mood 1 (Worst)
  "#f97316", // Mood 2
  "#eab308", // Mood 3 (Neutral)
  "#84cc16", // Mood 4
  "#22c55e", // Mood 5 (Best)
];

/**
 * Maps a mood score (1-5) to its corresponding heatmap color.
 * It rounds an average score and clamps it to ensure it's a valid index.
 */
const getMoodColor = (score: number): string => {
  const roundedScore = Math.round(score);
  // Clamp the score between 1 and 5 to safely use it as an index.
  const clampedScore = Math.max(1, Math.min(5, roundedScore));
  return MOOD_COLOR_SCALE[clampedScore - 1];
};

export const MoodCalendar: React.FC<Props> = ({
  moodData,
  onDateSelect,
  selectedDate,
}) => {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());

  // Averages the mood scores for each day in case of multiple entries
  const moodByDate = useMemo(() => {
    const map = new Map<string, number[]>();
    moodData.forEach(({ date, mood_score }) => {
      const key = dayjs(date).format("YYYY-MM-DD");
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(mood_score);
    });

    const averagedMap = new Map<string, number>();
    for (const [key, scores] of map.entries()) {
      const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      averagedMap.set(key, avg);
    }
    return averagedMap;
  }, [moodData]);

  const handleDateClick = (dateStr: string) => {
    if (onDateSelect) {
      // Allow unselecting a date by clicking it again
      onDateSelect(selectedDate === dateStr ? null : dateStr);
    }
  };

  const renderDays = () => {
    const startOfMonth = currentMonth.startOf("month");
    const endOfMonth = currentMonth.endOf("month");
    const startDate = startOfMonth.startOf("week");
    const endDate = endOfMonth.endOf("week");

    const days = [];
    let day = startDate;

    while (day.isBefore(endDate) || day.isSame(endDate)) {
      const dateStr = day.format("YYYY-MM-DD");
      const moodScore = moodByDate.get(dateStr);
      const isCurrentMonth = day.month() === currentMonth.month();
      const isTodaysDate = day.isToday();
      const isSelectedDate = selectedDate === dateStr;

      const bgColor =
        moodScore !== undefined ? getMoodColor(moodScore) : undefined;

      days.push(
        <div
          key={dateStr}
          className="relative aspect-square flex items-center justify-center group"
        >
          <button
            type="button"
            onClick={() => handleDateClick(dateStr)}
            className={clsx(
              "w-full h-full rounded-lg text-sm transition-all duration-200",
              isCurrentMonth
                ? "text-gray-700 dark:text-gray-200"
                : "text-gray-400 dark:text-gray-600",
              {
                "bg-gray-100 dark:bg-gray-800/50": !bgColor,
                "hover:bg-gray-200 dark:hover:bg-gray-700": !isSelectedDate,
                "font-semibold ring-2 ring-offset-2 dark:ring-offset-gray-800 ring-indigo-500":
                  isSelectedDate,
                "ring-2 ring-pink-500": isTodaysDate && !isSelectedDate,
              }
            )}
            style={{ backgroundColor: bgColor }}
          >
            <span
              className={clsx("z-10 relative", {
                "text-white font-bold": isSelectedDate && bgColor,
              })}
            >
              {day.date()}
            </span>
          </button>
          {moodScore !== undefined && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Mood: {moodScore.toFixed(1)} / 5
            </div>
          )}
        </div>
      );
      day = day.add(1, "day");
    }
    return days;
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
      {/* Header with navigation */}
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => setCurrentMonth((prev) => prev.subtract(1, "month"))}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 text-center text-lg">
          {currentMonth.format("MMMM YYYY")}
        </h2>
        <button
          onClick={() => setCurrentMonth((prev) => prev.add(1, "month"))}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 text-xs font-semibold text-center text-gray-500 dark:text-gray-400 mb-2">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      {/* Calendar Grid with Animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentMonth.format("YYYY-MM")}
          className="grid grid-cols-7 gap-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {renderDays()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
