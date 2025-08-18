import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import journalService, { type JournalEntry } from "../api/journalService";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import WeeklyMoodStrip from "../components/weeklyMoodStrip";
import { MoodCalendar } from "../components/moodCalender";
import { Pencil, Trash2, Plus, Search, BookOpen } from "lucide-react";
import { formatTimeAgo } from "../utils/DateFormatter";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion"; // Adjust path if necessary
import EmptyState from "../components/EmptyState";

dayjs.extend(isBetween);

// A new, self-contained component for each journal entry card
// This component remains unchanged.
const JournalEntryCard = ({ entry, onDelete }) => {
  const moodTags = useMemo(() => {
    if (Array.isArray(entry.mood_tags)) return entry.mood_tags;
    try {
      const parsed = JSON.parse(entry.mood_tags || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return (entry.mood_tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }, [entry.mood_tags]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all hover:shadow-lg hover:-translate-y-1"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <Link to={`/journal/view/${entry.id}`}>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                {entry.title}
              </h2>
            </Link>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatTimeAgo(entry.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/journal/edit/${entry.id}`}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-indigo-500"
            >
              <Pencil size={16} />
            </Link>
            <button
              onClick={onDelete}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-red-500"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">
          {entry.content}
        </p>
        {moodTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {moodTags.map((tag, idx) => (
              <span
                key={idx}
                className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 px-2.5 py-1 rounded-full text-xs font-semibold"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default function JournalList() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const location = useLocation();
  const searchTerm = new URLSearchParams(location.search).get("search") || "";
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  // State for infinite scroll
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const PAGE_LIMIT = 10; // Number of entries to fetch per page

  // Effect to reset entries and pagination when auth changes (e.g., user logs out/in)
  useEffect(() => {
    setEntries([]);
    setPage(0);
    setHasMore(true);
  }, [authMode, accessToken]);

  // Effect to fetch entries when the page number changes
  useEffect(() => {
    // Don't fetch if we know there are no more entries
    if (!hasMore && page > 0) return;

    setLoading(true);
    journalService
      .getAll(authMode, accessToken!, page, PAGE_LIMIT)
      .then((newEntries) => {
        // If it's the first page, replace the entries. Otherwise, append them.
        setEntries((prev) =>
          page === 0 ? newEntries : [...prev, ...newEntries]
        );
        // If the number of new entries is less than the limit, we've reached the end
        setHasMore(newEntries.length === PAGE_LIMIT);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load journal entries:", error);
        setLoading(false);
      });
  }, [page, authMode, accessToken]); // Re-fetches when page or auth state changes

  // Intersection Observer setup to detect when user scrolls to the last entry
  const observer = useRef<IntersectionObserver>();
  const lastEntryRef = useCallback(
    (node) => {
      if (loading) return; // Don't trigger while loading new data
      if (observer.current) observer.current.disconnect(); // Disconnect previous observer

      observer.current = new IntersectionObserver((entries) => {
        // If the last element is visible and there are more entries to load, increment the page
        if (entries[0].isIntersecting && hasMore) {
          setPage((prevPage) => prevPage + 1);
        }
      });

      if (node) observer.current.observe(node); // Observe the new last element
    },
    [loading, hasMore]
  );

  const handleDelete = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this entry?")) {
      await journalService.remove(authMode, accessToken!, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (selectedDate) {
      result = result.filter((e) =>
        dayjs(e.created_at).isSame(selectedDate, "day")
      );
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(lower) ||
          e.content.toLowerCase().includes(lower)
      );
    }
    // The sort is applied client-side to the currently loaded entries
    return result.sort((a, b) => dayjs(b.created_at).diff(dayjs(a.created_at)));
  }, [entries, selectedDate, searchTerm]);

  const moodDataForCalendar = useMemo(
    () =>
      entries.map((e) => ({
        date: e.created_at!,
        mood_score: e.mood_score ?? 50,
      })),
    [entries]
  );

  return (
    <div className="bg-gray-100 dark:bg-slate-900 min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            My Journal
          </h1>
          <Link
            to="/journal/new"
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all duration-200 hover:scale-105"
          >
            <Plus size={20} />
            <span>New Entry</span>
          </Link>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Main content: Entries list */}
          <div className="lg:col-span-2 space-y-6">
            {selectedDate && (
              <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <WeeklyMoodStrip
                  moodData={moodDataForCalendar}
                  selectedDate={selectedDate}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Showing entries for:{" "}
                    <strong>
                      {dayjs(selectedDate).format("MMMM D, YYYY")}
                    </strong>
                  </p>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    Show all
                  </button>
                </div>
              </div>
            )}
            <AnimatePresence>
              {filteredEntries.map((entry, index) => {
                // Attach the ref to the very last element in the list
                if (filteredEntries.length === index + 1) {
                  return (
                    <div ref={lastEntryRef} key={entry.id}>
                      <JournalEntryCard
                        entry={entry}
                        onDelete={() => handleDelete(entry.id!)}
                      />
                    </div>
                  );
                }
                return (
                  <JournalEntryCard
                    key={entry.id}
                    entry={entry}
                    onDelete={() => handleDelete(entry.id!)}
                  />
                );
              })}
            </AnimatePresence>

            {/* Show loading indicator at the bottom while fetching more entries */}
            {loading && (
              <div className="flex justify-center items-center p-4">
                <svg
                  className="animate-spin h-8 w-8 text-indigo-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <p className="ml-2 text-gray-600 dark:text-gray-300">
                  Loading more entries...
                </p>
              </div>
            )}

            {/* Show "end of list" message when all entries are loaded */}
            {!hasMore && entries.length > 0 && (
              <div className="text-center p-4 text-gray-500 dark:text-gray-400">
                <p>You've seen it all!</p>
              </div>
            )}

            {/* Show EmptyState only if not loading and the final list is empty */}
            {!loading && filteredEntries.length === 0 && (
              <div className="mt-8">
                <EmptyState
                  Icon={searchTerm ? Search : BookOpen}
                  title={searchTerm ? "No Results Found" : "No Entries Yet"}
                  message={
                    searchTerm
                      ? `Your search for "${searchTerm}" did not match any entries.`
                      : "Click 'New Entry' to write down your thoughts."
                  }
                />
              </div>
            )}
          </div>

          {/* Sidebar: Mood Calendar */}
          <aside className="sticky top-8 h-fit">
            <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <MoodCalendar
                moodData={moodDataForCalendar}
                onDateSelect={(date) => setSelectedDate(date)}
                selectedDate={selectedDate}
              />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
