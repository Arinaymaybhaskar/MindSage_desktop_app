import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import journalService, { type JournalEntry } from "../api/journalService";
import dayjs from "dayjs";
import WeeklyMoodStrip from "../components/weeklyMoodStrip";
import { MoodCalendar } from "../components/moodCalender";
import { PencilIcon, Trash2 } from "lucide-react";

export default function JournalList() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const location = useLocation();
  const searchTerm = new URLSearchParams(location.search).get("search") || "";
  const moodMap = ["😢", "😐", "🙂", "😄", "🤩"];

  useEffect(() => {
    journalService.getAll().then((res) => setEntries(res.data));
  }, []);

  const handleDelete = async (id: number) => {
    await journalService.remove(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // Filter by selected date if set
  let filteredEntries = selectedDate
    ? entries.filter(
        (e) => dayjs(e.created_at).format("YYYY-MM-DD") === selectedDate
      )
    : entries;

  // Then filter by search term
  if (searchTerm.trim()) {
    const lower = searchTerm.toLowerCase();
    filteredEntries = filteredEntries
      .filter(
        (e) =>
          e.title.toLowerCase().includes(lower) ||
          e.content.toLowerCase().includes(lower)
      )
      .sort((a, b) => {
        const aMatch = a.title.toLowerCase().includes(lower) ? 1 : 0;
        const bMatch = b.title.toLowerCase().includes(lower) ? 1 : 0;
        return bMatch - aMatch;
      });
  }

  // Weekly mood data (for selected date's week)
  const selected = dayjs(selectedDate ?? dayjs());
  const weekStart = selected.startOf("week");
  const weekEnd = selected.endOf("week");

  const weeklyMood = entries
    .filter((e) => {
      const d = dayjs(e.created_at);
      return (
        d.isAfter(weekStart.subtract(1, "day")) &&
        d.isBefore(weekEnd.add(1, "day"))
      );
    })
    .map((e) => ({
      date: e.created_at!,
      mood_score: e.mood_score ?? 3,
    }));

  // Mood data for calendar
  const moodData = entries.map((e) => ({
    date: e.created_at!,
    mood_score: e.mood_score ?? 3,
  }));

  return (
    <div className="max-w-6xl mx-auto mt-10 px-4 grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2">
        {selectedDate && (
          <div className="mb-4">
            <WeeklyMoodStrip moodData={weeklyMood} />
            <p className="text-sm text-gray-500 mt-1">
              Showing entries for{" "}
              <strong>{dayjs(selectedDate).format("MMMM D, YYYY")}</strong>
            </p>
          </div>
        )}

        <div className="space-y-4">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <Link
                    to={`/journal/view/${entry.id}`}
                    className="text-xl font-semibold mb-1"
                  >
                    {entry.title}
                  </Link>
                  <div className="flex gap-2">
                    {entry.mood_tags!.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center">
                  {moodMap[entry.mood_score ?? 0]}
                </div>
              </div>
              <div className="text-gray-700 mt-4">
                <p>{entry.content}</p>
              </div>
              <div className="flex justify-end mt-6 space-x-2">
                <Link
                  to={`/journal/edit/${entry.id}`}
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  <PencilIcon/>
                </Link>
                <button
                  onClick={() => handleDelete(entry.id!)}
                  type="button"
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2/>
                </button>
              </div>
            </div>
          ))}
          {filteredEntries.length === 0 && (
            <p className="text-gray-500 mt-4 text-sm">
              No journal entries found.
            </p>
          )}
        </div>
      </div>

      {/* Mood Calendar on right side */}
      <div className="sticky top-4 h-fit">
        <MoodCalendar
          moodData={moodData}
          onDateSelect={(date: any) => setSelectedDate(date)}
        />
      </div>
    </div>
  );
}
