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

const MOOD_COLOR_CLASSES = [
  "bg-danger", // Mood 1 (Worst)
  "bg-warning", // Mood 2
  "bg-light1 dark:bg-dark1", // Mood 3 (Neutral)
  "bg-success/80", // Mood 4 (A slightly lighter success)
  "bg-success", // Mood 5 (Best)
];

const getMoodColorClass = (score: number): string => {
  const roundedScore = Math.round(score);
  const clampedScore = Math.max(1, Math.min(5, roundedScore));
  return MOOD_COLOR_CLASSES[clampedScore - 1];
};

export const MoodCalendar: React.FC<Props> = ({
  moodData,
  onDateSelect,
  selectedDate,
}) => {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());

  // Logic for averaging moods by date remains the same...
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
      // By explicitly converting score to a number, you guarantee mathematical addition.
      const avg =
        scores.reduce((sum, score) => sum + Number(score), 0) / scores.length;
      averagedMap.set(key, avg);
    }
    return averagedMap;
  }, [moodData]);

  const handleDateClick = (dateStr: string) => {
    if (onDateSelect) {
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

      const bgColorClass =
        moodScore !== undefined ? getMoodColorClass(moodScore) : "";

      days.push(
        <div
          key={dateStr}
          className="relative aspect-square flex items-center justify-center group"
        >
          <button
            type="button"
            onClick={() => handleDateClick(dateStr)}
            // --- MODIFICATION: Updated clsx logic for backgrounds ---
            className={clsx(
              "w-full h-full rounded-lg text-sm transition-all duration-200",
              isCurrentMonth
                ? "text-text-light dark:text-text-dark"
                : "text-text-light-sub/50 dark:text-text-dark-sub/50",
              bgColorClass,
              {
                // In-month empty days have a tertiary background
                "bg-tertiary-light dark:bg-tertiary-dark":
                  !bgColorClass && isCurrentMonth,
                // Out-of-month days blend into the main background
                "bg-secondary-light dark:bg-secondary-dark": !isCurrentMonth,
                "hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80":
                  !isSelectedDate && !bgColorClass && isCurrentMonth,
                "font-semibold ring-2 ring-offset-2 ring-offset-secondary-light dark:ring-offset-secondary-dark ring-info":
                  isSelectedDate,
                "ring-2 ring-info/50": isTodaysDate && !isSelectedDate,
                "text-white font-bold":
                  (isSelectedDate || isTodaysDate) && bgColorClass,
              },
            )}
          >
            {day.date()}
          </button>
          {moodScore !== undefined && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-base-dark text-text-dark text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Mood: {moodScore.toFixed(1)} / 5
            </div>
          )}
        </div>,
      );
      day = day.add(1, "day");
    }
    return days;
  };

  return (
    <div className="bg-secondary-light dark:bg-secondary-dark p-4 rounded-xl">
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => setCurrentMonth((prev) => prev.subtract(1, "month"))}
          className="p-2 rounded-full hover:bg-tertiary-light dark:hover:bg-tertiary-dark text-text-light-sub dark:text-text-dark-sub transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="font-semibold text-text-light dark:text-text-dark text-center text-lg">
          {currentMonth.format("MMMM YYYY")}
        </h2>
        <button
          onClick={() => setCurrentMonth((prev) => prev.add(1, "month"))}
          className="p-2 rounded-full hover:bg-tertiary-light dark:hover:bg-tertiary-dark text-text-light-sub dark:text-text-dark-sub transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-xs font-semibold text-center text-text-light-sub dark:text-text-dark-sub mb-2">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

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
