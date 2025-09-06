import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import journalService, { type JournalEntry } from "../api/journalService";
import { qdrantService } from "../api/qdrantService";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import WeeklyMoodStrip from "../components/weeklyMoodStrip";
import { MoodCalendar } from "../components/moodCalender";
import {
  Pencil,
  Trash2,
  Plus,
  Search,
  BookOpen,
  CloudOff,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  CircleSlash,
  Cloud,
} from "lucide-react";
import { formatTimeAgo } from "../utils/DateFormatter";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import EmptyState from "../components/EmptyState";

dayjs.extend(isBetween);

const SyncIcon = (state: string) => {
  switch (state) {
    case "not_synced":
      return <CloudOff className="w-5 h-5 text-gray-400" />;
    case "pending":
      return <Clock className="w-5 h-5 text-yellow-500" />;
    case "in_progress":
      return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
    case "success":
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "failed":
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    default:
      return <CircleSlash className="w-5 h-5 text-gray-300" />;
  }
};

// --- JournalEntryCard Component ---
const JournalEntryCard = ({ entry, onDelete }: { entry: JournalEntry; onDelete: () => void }) => {
  const moodTags = useMemo(() => {
    if (Array.isArray(entry.mood_tags)) return entry.mood_tags;
    try {
      const parsed = JSON.parse(entry.mood_tags || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return (entry.mood_tags || "")
        .split(",")
        .map((t: string) => t.trim())
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
      className="bg-secondary-light dark:bg-secondary-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark transition-all hover:shadow-lg hover:-translate-y-1"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <Link to={`/journal/view/${entry.id}`}>
              <h2 className="text-xl font-bold text-text-light dark:text-text-dark hover:text-info dark:hover:text-info transition-colors">
                {entry.title}
              </h2>
            </Link>
            <p className="text-xs text-text-light-sub dark:text-text-dark-sub mt-1">
              {formatTimeAgo(entry.created_at || '')}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <p>{SyncIcon(entry.synced_to_qdrant || 'not_synced')}</p>
            <Link
              to={`/journal/edit/${entry.id}`}
              className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark hover:text-info dark:hover:text-info transition-colors"
              aria-label="Edit Entry"
            >
              <Pencil size={16} />
            </Link>
            <button
              onClick={onDelete}
              className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark hover:text-danger dark:hover:text-danger transition-colors"
              aria-label="Delete Entry"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        <p className="text-text-light-sub dark:text-text-dark-sub line-clamp-3 leading-relaxed">
          {entry.content}
        </p>
        {moodTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {moodTags.map((tag: string, idx: number) => (
              <span
                key={idx}
                className="bg-tertiary-light dark:bg-tertiary-dark text-info px-2.5 py-1 rounded-full text-xs font-semibold"
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

// --- JournalList Page Component ---
export default function JournalList() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const location = useLocation();
  const searchTerm = new URLSearchParams(location.search).get("search") || "";
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const PAGE_LIMIT = 10;

  useEffect(() => {
    setEntries([]);
    setPage(0);
    setHasMore(true);
  }, []);

  useEffect(() => {
    if (!hasMore && page > 0) return;

    setLoading(true);
    journalService
      .getAll(authMode, accessToken!, page, PAGE_LIMIT) // This is correct - page, limit
      .then((newEntries) => {
        setEntries((prev) =>
          page === 0 ? newEntries : [...prev, ...newEntries]
        );
        setHasMore(newEntries.length === PAGE_LIMIT);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load journal entries:", error);
        setLoading(false);
      });
  }, [page, authMode, accessToken]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastEntryRef = useCallback(
    (node: HTMLElement | null) => {
      // THIS IS THE FIX: If we are already loading, do nothing.
      if (loading) return;

      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setPage((prevPage) => prevPage + 1);
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, hasMore] // Add 'loading' to the dependency array
  );

  const handleDelete = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this entry?")) {
      await journalService.remove(authMode, accessToken!, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const handleBulkSync = async () => {
    if (bulkSyncing) return;
    
    setBulkSyncing(true);
    setSyncStatus("Starting bulk sync...");
    
    try {
      const result = await qdrantService.bulkSync();
      if (result.success) {
        setSyncStatus("Bulk sync started successfully!");
        // Refresh the entries to show updated sync status
        setTimeout(() => {
          setEntries([]);
          setPage(0);
          setHasMore(true);
          setSyncStatus(null);
        }, 2000);
      } else {
        setSyncStatus(`Sync failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Bulk sync error:", error);
      setSyncStatus(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBulkSyncing(false);
      // Clear status after 5 seconds
      setTimeout(() => setSyncStatus(null), 5000);
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
    return result.sort((a, b) => dayjs(b.created_at).diff(dayjs(a.created_at)));
  }, [entries, selectedDate, searchTerm]);

  const moodDataForCalendar = useMemo(
    () =>
      entries.map((e) => ({
        date: e.created_at!,
        mood_score: e.mood_score ?? 5,
      })),
    [entries]
  );

  return (
    <div className="bg-base-light dark:bg-base-dark min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold tracking-tight text-text-light dark:text-text-dark">
            My Journals
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkSync}
              disabled={bulkSyncing}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary-light dark:bg-secondary-dark text-text-light dark:text-text-dark font-semibold rounded-lg shadow-md hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 border border-border-light dark:border-border-dark"
            >
              {bulkSyncing ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Cloud size={20} />
              )}
              <span>{bulkSyncing ? "Syncing..." : "Sync All"}</span>
            </button>
            <Link
              to="/"
              className="flex items-center gap-2 px-5 py-2.5 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 transition-all duration-200 hover:scale-105"
            >
              <Plus size={20} />
              <span>New Entry</span>
            </Link>
          </div>
        </header>

        {syncStatus && (
          <div className="mb-6 p-4 bg-info/10 border border-info/20 rounded-lg">
            <p className="text-info font-medium text-center">{syncStatus}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            {selectedDate && (
              <div className="bg-secondary-light dark:bg-secondary-dark p-4 rounded-xl border border-border-light dark:border-border-dark">
                <WeeklyMoodStrip
                  moodData={moodDataForCalendar}
                  selectedDate={selectedDate}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
                    Showing entries for:{" "}
                    <strong className="text-text-light dark:text-text-dark">
                      {dayjs(selectedDate).format("MMMM D, YYYY")}
                    </strong>
                  </p>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="text-xs font-semibold text-info hover:underline"
                  >
                    Show all
                  </button>
                </div>
              </div>
            )}
            <AnimatePresence>
              {filteredEntries.map((entry, index) => {
                const cardProps = {
                  entry: entry,
                  onDelete: () => handleDelete(entry.id!),
                };
                if (filteredEntries.length === index + 1) {
                  return (
                    <div ref={lastEntryRef}>
                      <JournalEntryCard {...cardProps} key={entry.id} />
                    </div>
                  );
                }
                return <JournalEntryCard {...cardProps} key={entry.id} />;
              })}
            </AnimatePresence>

            {loading && (
              <div className="flex justify-center items-center p-4">
                <svg
                  className="animate-spin h-8 w-8 text-info"
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
                <p className="ml-2 text-text-light-sub dark:text-text-dark-sub">
                  Loading more entries...
                </p>
              </div>
            )}

            {!hasMore && entries.length > 0 && (
              <div className="text-center p-4 text-text-light-sub dark:text-text-dark-sub">
                <p>You've seen it all!</p>
              </div>
            )}

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

          <aside className="sticky top-8 h-fit">
            <div className="bg-secondary-light dark:bg-secondary-dark p-4 rounded-xl shadow-sm border border-border-light dark:border-border-dark">
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
