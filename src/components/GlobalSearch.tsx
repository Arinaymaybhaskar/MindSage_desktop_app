import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { motion } from "framer-motion";
import {
  Search,
  X,
  BookOpen,
  Target,
  ArrowRight,
  CornerDownLeft,
  Loader2,
  ListTodo,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { actionsCommands, settingsCommands } from "../utils/SearchActions";
import { MindSageMark } from "./ui/MindSageMark";
import { qdrantService } from "../api/qDrantService";
import journalService from "../api/journalService";
import { useAuth } from "../hooks/useAuth";
import clsx from "clsx";

dayjs.extend(relativeTime);

// --- Types ---
type ResultKind =
  | "Action"
  | "Setting"
  | "Journal"
  | "Goal"
  | "ProgressLog"
  | "SlashCommand"
  | "Recent";

interface SearchableItem {
  type: ResultKind;
  title: string;
  icon: React.ElementType;
  path?: string;
  action?: () => void;
  keywords?: string[];
  content?: string;
  /** Cosine similarity from Qdrant, 0..1. Absent on local matches. */
  relevance?: number;
  createdAt?: string;
  moodScore?: number;
  // --- Goal-specific ---
  current_value?: number;
  target_value?: number;
  unit?: string;
  // --- Progress log-specific ---
  goal_title?: string;
  value_logged?: number;
}

/** One hit from `qdrant:search`. The payload shape is written by the sync
 *  worker in electron/qdrantWorker.js and varies by `source_type`. */
interface QdrantHit {
  score?: number;
  payload?: {
    source_type?: "journal" | "goal" | "progress_log";
    source_id?: number;
    title?: string;
    content?: string;
    description?: string;
    created_at?: string;
    mood_score?: number | null;
    current_value?: number;
    target_value?: number;
    unit?: string;
    goal_title?: string;
    value_logged?: number;
  };
}

// Groups render in this order regardless of the order results arrive in, so
// the list does not reshuffle as the semantic query resolves.
const GROUP_ORDER = [
  "Recent Entries",
  "Commands",
  "Quick Actions",
  "Settings",
  "Journal Entries",
  "Goals",
  "Progress Logs",
] as const;

const GROUP_FOR: Record<ResultKind, string> = {
  SlashCommand: "Commands",
  Action: "Quick Actions",
  Setting: "Settings",
  Journal: "Journal Entries",
  Goal: "Goals",
  ProgressLog: "Progress Logs",
  Recent: "Recent Entries",
};

/**
 * Local (non-semantic) matches are capped so a keyword that happens to appear
 * in a dozen settings keyword lists cannot push every journal result below the
 * fold - finding entries is what the search is for.
 */
const MAX_LOCAL_RESULTS = 5;
const SEMANTIC_LIMIT = 8;
const DEBOUNCE_MS = 350;

const MOOD_DOT = [
  "bg-danger",
  "bg-warning",
  "bg-light1 dark:bg-dark1",
  "bg-success/80",
  "bg-success",
];

const moodDotClass = (score?: number) =>
  typeof score === "number" && score > 0
    ? MOOD_DOT[Math.max(1, Math.min(5, Math.round(score))) - 1]
    : null;

/** Escapes a user-typed string so it can be embedded in a RegExp. */
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Queries here are written as sentences ("the presentation I was dreading"),
 * so most of their words are grammar rather than subject matter. Highlighting
 * every "the" and "was" buries the one or two words that actually carry the
 * search, so only distinctive terms are treated as meaningful.
 */
const STOPWORDS = new Set([
  "about", "after", "again", "against", "been", "before", "being", "between",
  "both", "could", "does", "doing", "down", "during", "each", "from",
  "further", "have", "having", "here", "into", "just", "more", "most", "once",
  "only", "other", "over", "same", "should", "some", "such", "than", "that",
  "their", "them", "then", "there", "these", "they", "this", "those", "through",
  "under", "until", "very", "were", "what", "when", "where", "which", "while",
  "will", "with", "would", "your",
]);

/**
 * Relative date for a result row. Clamped at "just now" because a clock change
 * or a bad import can leave a row dated ahead of the present, and "in 6 hours"
 * on something you already wrote reads as a bug rather than as information.
 */
const relativeDate = (iso: string): string => {
  const at = dayjs(iso);
  if (!at.isValid()) return "";
  return at.isAfter(dayjs()) ? "just now" : at.fromNow();
};

/** The words from a query worth drawing attention to. */
const queryTerms = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));

/**
 * Emphasises the parts of `text` the user actually typed. Semantic search
 * returns entries that share no words with the query at all, so a result with
 * nothing highlighted is normal and correct - it simply renders unstyled.
 */
const Highlight: React.FC<{ text: string; query: string }> = ({
  text,
  query,
}) => {
  const terms = useMemo(() => queryTerms(query).map(escapeRegExp), [query]);

  if (terms.length === 0) return <>{text}</>;

  // \b keeps "the" out of "theatre" and "was" out of "washing" - matching
  // mid-word peppered the snippets with underlines that meant nothing.
  const pattern = new RegExp(`\\b(${terms.join("|")})`, "ig");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="bg-transparent text-text-light dark:text-text-dark font-semibold underline decoration-info/60 decoration-2 underline-offset-2"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

/**
 * Returns a ~160 character window of `content` centred on the first query term
 * that appears in it, rather than always slicing from the start. A semantic hit
 * is often buried in the middle of a long entry, and a snippet taken from the
 * opening sentence gives no clue why the entry matched.
 */
function snippetFor(content: string, query: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;

  const lower = clean.toLowerCase();
  const term = queryTerms(query).find((t) => lower.includes(t));

  if (!term) return `${clean.slice(0, 160).trimEnd()}…`;

  const at = lower.indexOf(term);
  const start = Math.max(0, at - 60);
  const end = Math.min(clean.length, start + 160);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${
    end < clean.length ? "…" : ""
  }`;
}

// --- Goal progress row ---
const GoalSearchResult = ({ item }: { item: SearchableItem }) => {
  const currentValue = item.current_value ?? 0;
  const targetValue = item.target_value || 1; // `|| 1` also guards a 0 target.
  const unit = item.unit || "";
  const pct = Math.min(100, Math.max(0, (currentValue / targetValue) * 100));

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-text-light dark:text-text-dark truncate">
          {item.title}
        </span>
        <span className="text-[11px] font-semibold text-text-light-sub dark:text-text-dark-sub tabular-nums flex-shrink-0">
          {currentValue} / {targetValue} {unit}
        </span>
      </div>
      <div className="w-full bg-tertiary-light dark:bg-tertiary-dark rounded-full h-1">
        <div
          className="h-1 rounded-full bg-info transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// --- Main component ---
export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const restoreFocusTo = useRef<Element | null>(null);

  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [semanticResults, setSemanticResults] = useState<SearchableItem[]>([]);
  const [recents, setRecents] = useState<SearchableItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  /**
   * The query the current `semanticResults` were produced for. Loading is
   * derived from this rather than from a boolean flag set inside an effect:
   * a flag only flips on the render *after* the keystroke, so for one frame
   * the palette looked idle with zero results and flashed "No matches" on
   * every character typed.
   */
  const [settledQuery, setSettledQuery] = useState("");

  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const allSearchableItems = useMemo(
    () => [...actionsCommands, ...settingsCommands] as SearchableItem[],
    []
  );

  const trimmed = query.trim();
  const isSlash = trimmed.startsWith("/");
  const hasQuery = trimmed.length > 0;

  // Restore focus to whatever was focused before the palette opened, so
  // dismissing it does not dump keyboard focus back on <body>.
  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      const previous = restoreFocusTo.current as HTMLElement | null;
      // Selecting a result navigates, which unmounts whatever had focus.
      // Refocusing a detached node would do nothing useful and, on a route
      // change, could pull focus away from the page just rendered.
      if (previous?.isConnected) previous.focus?.();
    };
  }, []);

  // Recent entries back the resting state. Fetched once; three rows is what
  // `journal:get-recent` returns.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const authMode = localStorage.getItem("authMode") || "offline";

    journalService
      .getRecent(authMode, accessToken)
      .then((rows: unknown) => {
        if (cancelled || !Array.isArray(rows)) return;
        setRecents(
          rows.map(
            (row): SearchableItem => ({
              type: "Recent",
              title: row.title?.trim() || "Untitled entry",
              icon: BookOpen,
              path: `/journal/view/${row.id}`,
              content: row.content_summary || row.content || "",
              createdAt: row.created_at,
              moodScore: row.mood_score,
            })
          )
        );
      })
      .catch(() => {
        // A missing recents strip is cosmetic; searching still works.
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Local matching. Title hits outrank keyword hits, and prefix hits outrank
  // mid-word ones, so typing "the" does not lead with "Change Theme".
  const localResults = useMemo<SearchableItem[]>(() => {
    if (!hasQuery) return [];

    if (isSlash) {
      // Previously this offered "Go to <whatever you typed>" and navigated
      // there blindly, which happily routed the user to a 404. Only real
      // destinations are offered now.
      const term = trimmed.toLowerCase();
      return allSearchableItems
        .filter((item) => item.path?.toLowerCase().startsWith(term))
        .slice(0, MAX_LOCAL_RESULTS)
        .map((item) => ({
          ...item,
          type: "SlashCommand" as const,
          title: item.path!,
          content: item.title,
          icon: ArrowRight,
        }));
    }

    const term = trimmed.toLowerCase();
    const scored = allSearchableItems
      .map((item) => {
        const title = item.title.toLowerCase();
        if (title.startsWith(term)) return { item, rank: 0 };
        if (title.includes(term)) return { item, rank: 1 };
        const kw = item.keywords?.find((k) => k.toLowerCase().includes(term));
        if (kw) return { item, rank: kw.toLowerCase() === term ? 2 : 3 };
        return null;
      })
      .filter((entry): entry is { item: SearchableItem; rank: number } =>
        Boolean(entry)
      )
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_LOCAL_RESULTS);

    return scored.map(({ item }) => item);
  }, [trimmed, hasQuery, isSlash, allSearchableItems]);

  const groupedResults = useMemo(() => {
    // With no query the palette shows the last few entries plus the most
    // common jumps, so opening it is immediately useful instead of presenting
    // an empty bar that reveals nothing about what can be searched.
    const source: SearchableItem[] = hasQuery
      ? [...localResults, ...semanticResults]
      : [...recents, ...(allSearchableItems.slice(0, 4) as SearchableItem[])];

    const groups = new Map<string, SearchableItem[]>();
    for (const item of source) {
      const name = GROUP_FOR[item.type] ?? "Other Matches";
      const bucket = groups.get(name);
      if (bucket) bucket.push(item);
      else groups.set(name, [item]);
    }

    return [...groups.entries()].sort(
      (a, b) =>
        GROUP_ORDER.indexOf(a[0] as (typeof GROUP_ORDER)[number]) -
        GROUP_ORDER.indexOf(b[0] as (typeof GROUP_ORDER)[number])
    );
  }, [hasQuery, localResults, semanticResults, recents, allSearchableItems]);

  const flatResults = useMemo(
    () => groupedResults.flatMap(([, items]) => items),
    [groupedResults]
  );

  // Index of the first row of each group, used to number rows without an
  // O(n²) `findIndex` by reference inside the render.
  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const [, items] of groupedResults) {
      offsets.push(running);
      running += items.length;
    }
    return offsets;
  }, [groupedResults]);

  // The result list shrinks asynchronously when a semantic response lands, so
  // an index chosen with the arrow keys can end up past the end. Left
  // unclamped, nothing appears selected and Enter silently does nothing.
  useEffect(() => {
    setHighlightedIndex((prev) =>
      Math.min(prev, Math.max(0, flatResults.length - 1))
    );
    itemRefs.current.length = flatResults.length;
  }, [flatResults.length]);

  const handleSelect = useCallback(
    (item: SearchableItem) => {
      if (item.action) item.action();
      else if (item.path) navigate(item.path);
      onClose();
    },
    [navigate, onClose]
  );

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        flatResults.length === 0 ? 0 : (prev + 1) % flatResults.length
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        flatResults.length === 0
          ? 0
          : (prev - 1 + flatResults.length) % flatResults.length
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlightedIndex(Math.max(0, flatResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatResults[highlightedIndex];
      if (item) handleSelect(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // App.tsx also listens for Escape on `window` and closes the palette
      // outright, so this has to stop the event to keep the first press for
      // clearing the query - which is what every command palette does and
      // saves reopening to retype.
      e.stopPropagation();
      if (query) setQuery("");
      else onClose();
    }
  };

  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  // Semantic search.
  useEffect(() => {
    if (!hasQuery || isSlash) {
      setSemanticResults([]);
      setSearchError(null);
      setSettledQuery(trimmed);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const results = await qdrantService.search(
          accessToken!,
          "mind_entries",
          trimmed,
          SEMANTIC_LIMIT
        );

        // The IPC handler answers `{ success: false, error }` rather than
        // throwing when embedding fails - which is the normal outcome when
        // Ollama is not running. Treating that as an empty result set is why
        // the palette used to sit there claiming "No results".
        if (!Array.isArray(results)) {
          const message =
            (results as { error?: string })?.error ??
            "Semantic search is unavailable.";
          if (!cancelled) {
            setSearchError(message);
            setSemanticResults([]);
          }
          return;
        }

        if (cancelled) return;
        setSearchError(null);
        setSemanticResults(
          (results as QdrantHit[]).map((res): SearchableItem => {
            const p = res.payload ?? {};
            if (p.source_type === "goal") {
              return {
                type: "Goal",
                title: p.title || "Untitled Goal",
                icon: Target,
                path: `/goals/view/${p.source_id}`,
                current_value: p.current_value,
                target_value: p.target_value,
                unit: p.unit,
                content: p.description || "",
                relevance: res.score,
                createdAt: p.created_at,
              };
            }
            if (p.source_type === "progress_log") {
              return {
                type: "ProgressLog",
                title: p.title || `Progress for "${p.goal_title || "goal"}"`,
                icon: ListTodo,
                path: `/progress-logs/${p.source_id}`,
                content:
                  p.description || `Logged ${p.value_logged} ${p.unit || ""}`,
                goal_title: p.goal_title,
                value_logged: p.value_logged,
                relevance: res.score,
                createdAt: p.created_at,
              };
            }
            return {
              type: "Journal",
              title: p.title || "Untitled Entry",
              icon: BookOpen,
              content: p.content || "",
              path: `/journal/view/${p.source_id}`,
              relevance: res.score,
              createdAt: p.created_at,
              moodScore: p.mood_score ?? undefined,
            };
          })
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Semantic search error:", err);
          setSearchError(
            err instanceof Error ? err.message : "Semantic search failed."
          );
          setSemanticResults([]);
        }
      } finally {
        if (!cancelled) setSettledQuery(trimmed);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, hasQuery, isSlash, accessToken]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setHighlightedIndex(0);
  };

  const busy = hasQuery && !isSlash && settledQuery !== trimmed;
  const showEmptyState = hasQuery && flatResults.length === 0 && !busy;
  const activeId =
    flatResults.length > 0 ? `global-search-option-${highlightedIndex}` : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm flex justify-center z-[100]"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: -12, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Search MindSage"
        data-testid="global-search"
        data-expanded={flatResults.length > 0 || showEmptyState ? "true" : "false"}
        className="relative mt-[12vh] mx-4 w-full max-w-2xl h-fit max-h-[70vh] bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl ring-1 ring-black/5 border border-border-light dark:border-border-dark overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-border-light dark:border-border-dark">
          {busy ? (
            <Loader2
              size={18}
              className="text-info flex-shrink-0 animate-spin"
              aria-hidden
            />
          ) : (
            <Search
              size={18}
              className="text-text-light-sub dark:text-text-dark-sub flex-shrink-0"
              aria-hidden
            />
          )}
          <input
            ref={inputRef}
            data-testid="global-search-input"
            type="text"
            role="combobox"
            aria-expanded={flatResults.length > 0}
            aria-controls="global-search-results"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Search your entries, goals and settings…"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-text-light dark:text-text-dark placeholder:text-text-light-sub/70 dark:placeholder:text-text-dark-sub/70"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-[11px] px-2 py-1 rounded-md text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors flex-shrink-0"
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors flex-shrink-0"
            aria-label="Close search"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          className="overflow-y-auto overscroll-contain p-2 flex-1 min-h-0"
        >
          {searchError && (
            <div className="mx-1 mb-2 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <AlertTriangle
                size={16}
                className="text-warning flex-shrink-0 mt-0.5"
                aria-hidden
              />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm font-medium text-text-light dark:text-text-dark">
                  Semantic search is unavailable
                </span>
                <span className="text-xs text-text-light-sub dark:text-text-dark-sub break-words">
                  {searchError} Entries are found by meaning using a local
                  embedding model; check that Ollama is running.
                </span>
                <button
                  onClick={() => {
                    navigate("/settings/models");
                    onClose();
                  }}
                  className="self-start text-xs font-medium text-info hover:underline underline-offset-2"
                >
                  Open model settings
                </button>
              </div>
            </div>
          )}

          {flatResults.length > 0 &&
            groupedResults.map(([groupName, items], groupIdx) => (
              <div key={groupName} className="mb-1 last:mb-0">
                <div
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-light-sub/80 dark:text-text-dark-sub/80"
                >
                  {groupName}
                </div>
                <div className="space-y-0.5">
                  {items.map((item, index) => {
                    const globalIndex = groupOffsets[groupIdx] + index;
                    const isActive = highlightedIndex === globalIndex;
                    return (
                      <button
                        key={`${groupName}-${globalIndex}`}
                        id={`global-search-option-${globalIndex}`}
                        role="option"
                        aria-selected={isActive}
                        ref={(el) => {
                          itemRefs.current[globalIndex] = el;
                        }}
                        data-testid={`search-result-${globalIndex}`}
                        onClick={() => handleSelect(item)}
                        onMouseMove={() => setHighlightedIndex(globalIndex)}
                        className={clsx(
                          "group flex w-full text-left items-center gap-3 px-3 py-2.5 rounded-xl transition-colors outline-none",
                          isActive
                            ? "bg-tertiary-light dark:bg-tertiary-dark"
                            : "hover:bg-tertiary-light/60 dark:hover:bg-tertiary-dark/60"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
                            isActive
                              ? "bg-info/15 text-info"
                              : "bg-tertiary-light dark:bg-tertiary-dark text-text-light-sub dark:text-text-dark-sub"
                          )}
                        >
                          <item.icon size={16} aria-hidden />
                        </span>

                        {item.type === "Goal" ? (
                          <GoalSearchResult item={item} />
                        ) : (
                          <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              {moodDotClass(item.moodScore) && (
                                <span
                                  className={clsx(
                                    "h-1.5 w-1.5 rounded-full flex-shrink-0",
                                    moodDotClass(item.moodScore)
                                  )}
                                  aria-hidden
                                />
                              )}
                              <span className="text-sm font-medium text-text-light dark:text-text-dark truncate">
                                <Highlight text={item.title} query={trimmed} />
                              </span>
                            </div>
                            {item.goal_title && (
                              <span className="text-xs text-text-light-sub dark:text-text-dark-sub truncate">
                                {item.goal_title}
                              </span>
                            )}
                            {item.content && (
                              <span className="text-xs leading-relaxed text-text-light-sub dark:text-text-dark-sub line-clamp-2">
                                <Highlight
                                  text={snippetFor(item.content, trimmed)}
                                  query={trimmed}
                                />
                              </span>
                            )}
                          </div>
                        )}

                        <span className="ml-auto flex items-center gap-2 flex-shrink-0 pl-2">
                          {item.createdAt && (
                            <span className="hidden sm:inline text-[11px] text-text-light-sub/80 dark:text-text-dark-sub/80 whitespace-nowrap">
                              {relativeDate(item.createdAt)}
                            </span>
                          )}
                          <CornerDownLeft
                            size={13}
                            aria-hidden
                            className={clsx(
                              "transition-opacity text-text-light-sub dark:text-text-dark-sub",
                              isActive ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

          {/* Resting state hint, shown under the recents */}
          {!hasQuery && (
            <div className="px-3 py-3 mt-1 flex items-start gap-2.5 text-xs text-text-light-sub dark:text-text-dark-sub border-t border-border-light/60 dark:border-border-dark/60">
              <MindSageMark size={14} className="mt-0.5 text-info" aria-hidden />
              <span className="leading-relaxed">
                Search finds entries by <em>meaning</em>, not keywords. Try
                “times I felt overwhelmed at work” or “when I was proud of
                myself”.
              </span>
            </div>
          )}

          {/* In-flight, with nothing to show yet */}
          {busy && flatResults.length === 0 && !searchError && (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-text-light-sub dark:text-text-dark-sub">
              <Loader2 size={15} className="animate-spin" aria-hidden />
              <span>Searching your memories…</span>
            </div>
          )}

          {showEmptyState && !searchError && (
            <div className="flex flex-col items-center gap-1.5 py-14 px-6 text-center">
              <Search
                size={20}
                className="text-text-light-sub/60 dark:text-text-dark-sub/60"
                aria-hidden
              />
              <p className="text-sm font-medium text-text-light dark:text-text-dark">
                No matches for “{trimmed}”
              </p>
              <p className="text-xs text-text-light-sub dark:text-text-dark-sub max-w-sm leading-relaxed">
                Only entries that have been indexed are searchable. Try
                describing the feeling or situation rather than the exact words
                you wrote.
              </p>
            </div>
          )}
        </div>

        {/* Footer legend */}
        <div className="flex items-center justify-between gap-4 px-4 h-9 flex-shrink-0 border-t border-border-light dark:border-border-dark bg-tertiary-light/50 dark:bg-tertiary-dark/30 text-[11px] text-text-light-sub dark:text-text-dark-sub">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 rounded border border-border-light dark:border-border-dark font-sans">
                ↑
              </kbd>
              <kbd className="px-1 py-0.5 rounded border border-border-light dark:border-border-dark font-sans">
                ↓
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1 py-0.5 rounded border border-border-light dark:border-border-dark font-sans">
                ↵
              </kbd>
              open
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded border border-border-light dark:border-border-dark font-sans">
                esc
              </kbd>
              close
            </span>
          </div>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {hasQuery ? (
              <>
                <MindSageMark size={11} className="text-info" aria-hidden />
                {flatResults.length} result
                {flatResults.length === 1 ? "" : "s"}
              </>
            ) : (
              <>
                <Clock size={11} aria-hidden />
                recent
              </>
            )}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
