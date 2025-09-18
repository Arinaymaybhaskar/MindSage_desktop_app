import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  AlertTriangle,
} from "lucide-react";
import { formatTimeAgo } from "../utils/DateFormatter";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";

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

const displayTitle = (title: string | null) => {
  if (!title || title.trim() === "") return "Untitled Entry";
  return title.length > 60 ? title.slice(0, 60) + "..." : title;
};

// --- JournalEntryCard Component ---
const JournalEntryCard = ({
  entry,
  onDelete,
  selected,
  onSelect,
}: {
  entry: JournalEntry;
  onDelete: () => void;
  selected: boolean;
  onSelect: () => void;
}) => {
  const navigate = useNavigate();
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
      onClick={onSelect}
      onDoubleClick={() => navigate(`/journal/view/${entry.id}`)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className={`cursor-pointer  rounded-xl shadow-sm border transition-all hover:shadow-lg hover:-translate-y-1
        ${
          selected
            ? "bg-tertiary-light dark:bg-tertiary-dark border-border-dark dark:border-border-light "
            : "border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark"
        }`}
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-text-light dark:text-text-dark transition-colors">
              {displayTitle(entry.title)}
            </h2>
            <p className="text-xs text-text-light-sub dark:text-text-dark-sub mt-1">
              {formatTimeAgo(entry.created_at || "")}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <p>{SyncIcon(entry.synced_to_qdrant || "not_synced")}</p>
            <Link
              to={`/journal/edit/${entry.id}`}
              className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark hover:text-dark1 dark:hover:text-light1 transition-colors"
              aria-label="Edit Entry"
              onClick={(e) => e.stopPropagation()}
            >
              <Pencil size={16} />
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
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
                className="bg-tertiary-light dark:bg-tertiary-dark text-dark1 dark:text-light1 px-2.5 py-1 rounded-full text-xs font-semibold"
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
  const navigate = useNavigate();
  const [deleteModalInfo, setDeleteModalInfo] = useState<{
    isOpen: boolean;
    entryId: number | null;
  }>({
    isOpen: false,
    entryId: null,
  });
  const entryRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    setEntries([]);
    setPage(0);
    setHasMore(true);
  }, []);

  useEffect(() => {
    if (!hasMore && page > 0) return;

    setLoading(true);
    journalService
      .getAll(authMode, accessToken!, page, PAGE_LIMIT)
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
      if (loading) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setPage((prevPage) => prevPage + 1);
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, hasMore]
  );

  const handleDelete = async (id: number) => {
    await journalService.remove(authMode, accessToken!, id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDeleteModalInfo({ isOpen: false, entryId: null });
  };

  // --- Inside JournalList ---

  const DeleteModal = (onClose: () => void, isOpen: boolean) => {
    const deleteBtnRef = useRef<HTMLButtonElement>(null);
    const cancelBtnRef = useRef<HTMLButtonElement>(null);
    const [focused, setFocused] = useState<"delete" | "cancel">("delete");

    useEffect(() => {
      if (isOpen && deleteBtnRef.current) {
        deleteBtnRef.current.focus();
        setFocused("delete");
      }
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }

        if (
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "Tab"
        ) {
          e.preventDefault();
          if (focused === "delete") {
            setFocused("cancel");
            cancelBtnRef.current?.focus();
          } else {
            setFocused("delete");
            deleteBtnRef.current?.focus();
          }
        }

        if (e.key === "Enter") {
          e.preventDefault();
          if (focused === "delete") {
            handleDelete(deleteModalInfo.entryId!);
          } else if (focused === "cancel") {
            onClose();
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [focused, isOpen, onClose]);

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Confirm Deletion"
        size="md"
      >
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
            <AlertTriangle className="h-6 w-6 text-danger" aria-hidden="true" />
          </div>
          <div className="mt-4">
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Are you sure you want to delete this entry? This action cannot be
              undone.
            </p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={deleteBtnRef}
            type="button"
            onClick={() => handleDelete(deleteModalInfo.entryId!)}
            className={`w-full inline-flex justify-center rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors
            ${
              focused === "delete"
                ? "bg-danger text-white ring-2 ring-offset-2 ring-danger"
                : "bg-danger text-white hover:bg-danger/90"
            }`}
          >
            Delete
          </button>
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            className={`w-full inline-flex justify-center rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors
            ${
              focused === "cancel"
                ? "bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark ring-2 ring-offset-2 ring-border-dark"
                : "bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80"
            }`}
          >
            Cancel
          </button>
        </div>
      </Modal>
    );
  };

  const handleBulkSync = async () => {
    if (bulkSyncing) return;

    setBulkSyncing(true);
    setSyncStatus("Starting bulk sync...");

    try {
      const result = await qdrantService.bulkSync();
      if (result.success) {
        setSyncStatus("Bulk sync started successfully!");
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
      setSyncStatus(
        `Sync failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setBulkSyncing(false);
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
          e.title?.toLowerCase().includes(lower) ||
          e.content?.toLowerCase().includes(lower)
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

  // Scroll selected entry into view
  useEffect(() => {
    if (selectedId && entryRefs.current.has(selectedId)) {
      const el = entryRefs.current.get(selectedId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [selectedId]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredEntries.length === 0) return;
      if (deleteModalInfo.isOpen) return;
      const currentIndex = filteredEntries.findIndex(
        (e) => e.id === selectedId
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex =
          currentIndex === -1
            ? 0
            : Math.min(currentIndex + 1, filteredEntries.length - 1);
        setSelectedId(filteredEntries[nextIndex].id!);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex =
          currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
        setSelectedId(filteredEntries[prevIndex].id!);
      }

      if (e.key === "Enter" && currentIndex !== -1) {
        navigate(`/journal/view/${filteredEntries[currentIndex].id}`);
      }

      if (e.key === "Delete" && currentIndex !== -1) {
        e.preventDefault();
        setDeleteModalInfo({
          isOpen: true,
          entryId: filteredEntries[currentIndex].id!,
        });
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "e" && currentIndex !== -1) {
          e.preventDefault();
          navigate(`/journal/edit/${filteredEntries[currentIndex].id}`);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredEntries, selectedId, deleteModalInfo.isOpen]);

  return (
    <div className="bg-base-light dark:bg-base-dark min-h-screen">
      {DeleteModal(
        () => setDeleteModalInfo({ isOpen: false, entryId: null }),
        deleteModalInfo.isOpen
      )}
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
              className="flex items-center gap-2 px-5 py-2.5 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 dark:hover:bg-dark1 transition-all duration-200 hover:scale-105"
            >
              <Plus size={20} />
              <span>New Entry</span>
            </Link>
          </div>
        </header>

        {syncStatus && (
          <div className="mb-6 p-4 bg-light1 dark:bg-dark1 border border-info/20 rounded-lg">
            <p className="text-dark1 dark:text-light1 font-medium text-center">
              {syncStatus}
            </p>
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
                    className="text-xs font-semibold text-dark1 dark:text-light1 hover:underline"
                  >
                    Show all
                  </button>
                </div>
              </div>
            )}
            <AnimatePresence>
              {filteredEntries.map((entry, index) => {
                const cardProps = {
                  entry,
                  onDelete: () =>
                    setDeleteModalInfo({ isOpen: true, entryId: entry.id! }),
                  selected: entry.id === selectedId,
                  onSelect: () => setSelectedId(entry.id!),
                };
                if (filteredEntries.length === index + 1) {
                  return (
                    <div
                      ref={(el) => {
                        entryRefs.current.set(entry.id!, el);
                        lastEntryRef(el);
                      }}
                      key={entry.id}
                    >
                      <JournalEntryCard {...cardProps} />
                    </div>
                  );
                }
                return (
                  <div
                    ref={(el) => entryRefs.current.set(entry.id!, el)}
                    key={entry.id}
                  >
                    <JournalEntryCard {...cardProps} />
                  </div>
                );
              })}
            </AnimatePresence>

            {loading && (
              <div className="flex justify-center items-center p-4">
                <svg
                  className="animate-spin h-8 w-8 text-dark1 dark:text-light1"
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
