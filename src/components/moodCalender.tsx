import React, { useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import clsx from "clsx";

type MoodEntry = {
  date: string; // ISO format
  mood_score: number; // 1-5
};

type Props = {
  moodData: MoodEntry[];
  onDateSelect?: (date: string) => void;
};

const moodMap = ["😢", "😐", "🙂", "😄", "🤩"];

export const MoodCalendar: React.FC<Props> = ({ moodData, onDateSelect }) => {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());

  const startOfMonth = currentMonth.startOf("month");
  const endOfMonth = currentMonth.endOf("month");
  const startDate = startOfMonth.startOf("week");
  const endDate = endOfMonth.endOf("week");

  const calendarDays: Dayjs[] = [];
  let curr = startDate;
  while (curr.isBefore(endDate) || curr.isSame(endDate)) {
    calendarDays.push(curr);
    curr = curr.add(1, "day");
  }

  // Average mood scores
  const moodByDate = new Map<string, number>();
  const moodCount = new Map<string, number>();

  moodData.forEach(({ date, mood_score }) => {
    const key = dayjs(date).format("YYYY-MM-DD");
    if (!moodByDate.has(key)) {
      moodByDate.set(key, mood_score);
      moodCount.set(key, 1);
    } else {
      const total = moodByDate.get(key)! * moodCount.get(key)! + mood_score;
      const count = moodCount.get(key)! + 1;
      moodByDate.set(key, total / count);
      moodCount.set(key, count);
    }
  });

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => prev.subtract(1, "month"));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => prev.add(1, "month"));
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-md space-y-2">
      {/* Header with navigation */}
      <div className="flex justify-between items-center mb-2">
        <button
          onClick={handlePrevMonth}
          className="text-indigo-600 hover:underline text-sm"
        >
          ← Prev
        </button>
        <h2 className="font-semibold text-gray-800">
          {currentMonth.format("MMMM YYYY")}
        </h2>
        <button
          onClick={handleNextMonth}
          className="text-indigo-600 hover:underline text-sm"
        >
          Next →
        </button>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 text-xs font-semibold text-center text-gray-600">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day) => {
          const dateStr = day.format("YYYY-MM-DD");
          const rawMood = moodByDate.get(dateStr);
          const mood = rawMood ? Math.round(rawMood) : null;

          const isCurrentMonth = day.month() === currentMonth.month();

          return (
            <div
              key={dateStr}
              onClick={() => onDateSelect?.(dateStr)}
              className={clsx(
                "h-12 flex items-center justify-center border rounded text-sm cursor-pointer hover:bg-indigo-100 transition",
                isCurrentMonth ? "bg-gray-50" : "bg-gray-100 text-gray-400"
              )}
            >
              <div className="flex flex-col items-center">
                <span className="text-[10px]">{day.date()}</span>
                <span>{mood ? moodMap[mood - 1] : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
