import React from "react";
import dayjs from "dayjs";

type MoodEntry = {
  date: string; // e.g. "2025-07-06"
  mood_score: number; // 1 to 5
};

const moodMap = ["😢", "😐", "🙂", "😄", "🤩"];

const WeeklyMoodStrip: React.FC<{ moodData: MoodEntry[] }> = ({ moodData }) => {
  const startOfWeek = dayjs().startOf("week");
  const days = Array.from({ length: 7 }).map((_, i) =>
    startOfWeek.add(i, "day")
  );

  const moodByDate = new Map<string, number>();

  moodData.forEach(({ date, mood_score }) => {
    const key = dayjs(date).format("YYYY-MM-DD");
    if (!moodByDate.has(key)) {
      moodByDate.set(key, mood_score);
    } else {
      const existing = moodByDate.get(key)!;
      // Store as float temporarily in map
      const count = moodByDate.get(`${key}_count`) || 1;
      const total = existing * count + mood_score;
      const newCount = count + 1;
      moodByDate.set(key, total / newCount);
      moodByDate.set(`${key}_count`, newCount);
    }
  });

  return (
    <div className="flex gap-3 justify-between bg-white p-4 shadow-md rounded-lg">
      {days.map((day) => {
        const dateStr = day.format("YYYY-MM-DD");
        const rawMood = moodByDate.get(dateStr);
        const mood = rawMood ? Math.round(rawMood) : null;
        return (
          <div
            key={dateStr}
            className="flex flex-col items-center text-xs text-gray-600"
          >
            <span>{day.format("ddd")}</span>
            <span className="text-2xl">{mood ? moodMap[mood - 1] : "—"}</span>
          </div>
        );
      })}
    </div>
  );
};

export default WeeklyMoodStrip;
