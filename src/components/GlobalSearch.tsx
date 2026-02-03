import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  BookOpen,
  Target,
  Settings,
  ArrowRight,
  CornerDownLeft,
  Loader2,
  ListTodo,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { actionsCommands, settingsCommands } from "../utils/SearchActions";
import { qdrantService } from "../api/qdrantService";
import { useAuth } from "../hooks/useAuth";
import clsx from "clsx";

// --- Enriched Type Definitions ---
interface SearchableItem {
  type:
    | "Action"
    | "Setting"
    | "Journal"
    | "Goal"
    | "ProgressLog"
    | "SlashCommand"
    | "SemanticMatch";
  title: string;
  icon: React.ElementType;
  path?: string;
  action?: () => void;
  keywords?: string[];
  content?: string;
  // --- Goal-specific properties ---
  current_value?: number;
  target_value?: number;
  unit?: string;
  // --- Progress Log-specific properties ---
  goal_title?: string;
  value_logged?: number;
}

// --- Special UI Component for Goal Search Results ---
const GoalSearchResult = ({ item }: { item: SearchableItem }) => {
  // Ensure item has the necessary properties for a goal, or provide fallbacks
  const currentValue = item.current_value ?? 0;
  const targetValue = item.target_value ?? 1; // Avoid division by zero
  const unit = item.unit || "";

  const progress = (currentValue / targetValue) * 100;
  const progressPercentage = Math.min(100, Math.max(0, progress));

  return (
    <div className="flex flex-col gap-2 flex-1">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-text-light dark:text-text-dark truncate">
          {item.title}
        </span>
        <span className="text-xs font-semibold text-info">
          {progressPercentage.toFixed(0)}%
        </span>
      </div>
      <div className="w-full bg-tertiary-light dark:bg-tertiary-dark rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-info"
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>
      <span className="text-xs text-text-light-sub dark:text-text-dark-sub">
        {`${currentValue} / ${targetValue} ${unit}`}
      </span>
    </div>
  );
};

// --- Main Component ---
export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [semanticResults, setSemanticResults] = useState<SearchableItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // New state to control expansion
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const allSearchableItems: SearchableItem[] = useMemo(
    () => [...actionsCommands, ...settingsCommands],
    [navigate]
  );

  // Auto-focus input and handle Escape key
  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Combined filtered and semantic results with grouping
  const groupedResults = useMemo(() => {
    let localItems: SearchableItem[] = [];
    if (query.startsWith("/")) {
      localItems = [
        {
          type: "SlashCommand",
          title: `Go to ${query}`,
          path: query,
          icon: ArrowRight,
        },
      ];
    } else if (query) {
      const searchTerm = query.toLowerCase();
      localItems = allSearchableItems.filter((item) => {
        const inTitle = item.title.toLowerCase().includes(searchTerm);
        const inKeywords =
          item.keywords?.some((k) => k.toLowerCase().includes(searchTerm)) ??
          false;
        return inTitle || inKeywords;
      });
    }

    const allItems = [...localItems, ...semanticResults];

    // Group by type
    return allItems.reduce((acc, item) => {
      // Determine the group name
      let groupName: string;
      if (item.type === "Goal") {
        groupName = "Goals";
      } else if (item.type === "Journal") {
        groupName = "Journal Entries";
      } else if (item.type === "ProgressLog") {
        groupName = "Progress Logs";
      } else if (item.type === "Action") {
        groupName = "Quick Actions";
      } else if (item.type === "Setting") {
        groupName = "Settings";
      } else if (item.type === "SlashCommand") {
        groupName = "Commands";
      } else {
        groupName = "Other Matches"; // Fallback
      }

      (acc[groupName] = acc[groupName] || []).push(item);
      return acc;
    }, {} as Record<string, SearchableItem[]>);
  }, [query, allSearchableItems, semanticResults]);

  const flatResults = useMemo(
    () => Object.values(groupedResults).flat(),
    [groupedResults]
  );

  const handleSelect = (item: SearchableItem) => {
    if (item.action) item.action();
    else if (item.path) navigate(item.path);
    onClose();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatResults[highlightedIndex]) {
        handleSelect(flatResults[highlightedIndex]);
      }
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [highlightedIndex]);

  // Semantic search logic
  useEffect(() => {
    if (!query || query.startsWith("/")) {
      setSemanticResults([]);
      return;
    }

    const fetchSemanticResults = async () => {
      setIsSearching(true);
      try {
        const results = await qdrantService.search(
          accessToken!,
          "mind_entries",
          query,
          5
        );
        const mappedResults: SearchableItem[] = results.map(
          (res: any): SearchableItem => {
            if (res.payload?.source_type === "goal") {
              return {
                type: "Goal",
                title: res.payload?.title || "Untitled Goal",
                icon: Target,
                path: `/goals/view/${res.payload?.source_id}`,
                current_value: res.payload?.current_value,
                target_value: res.payload?.target_value,
                unit: res.payload?.unit,
                content: res.payload?.description || "",
              };
            } else if (res.payload?.source_type === "progress_log") {
              return {
                type: "ProgressLog",
                title:
                  res.payload?.title ||
                  `Progress for "${
                    res.payload?.goal_title || "Untitled Goal"
                  }"`,
                icon: ListTodo,
                path: `/progress-logs/${res.payload?.source_id}`,
                content:
                  res.payload?.description ||
                  `Logged ${res.payload?.value_logged} ${
                    res.payload?.unit || ""
                  }`,
                goal_title: res.payload?.goal_title,
                value_logged: res.payload?.value_logged,
              };
            }
            // Default to journal
            return {
              type: "Journal",
              title: res.payload?.title || "Untitled Entry",
              icon: BookOpen,
              content:
                res.payload?.content?.slice(0, 100) +
                (res.payload?.content?.length > 100 ? "..." : ""),
              path: `/journal/view/${res.payload?.source_id}`,
            };
          }
        );
        setSemanticResults(mappedResults);
      } catch (err) {
        console.error("Semantic search error:", err);
      } finally {
        setIsSearching(false);
      }
    };
    const debounceTimeout = setTimeout(fetchSemanticResults, 500);
    return () => clearTimeout(debounceTimeout);
  }, [query, accessToken]);

  // Handle input change to trigger expansion
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setHighlightedIndex(0);

    // Expand if query is not empty AND not a slash command
    if (newQuery && !newQuery.startsWith("/")) {
      setIsExpanded(true);
    } else {
      // Collapse if query becomes empty or starts with '/' (only showing slash command suggestion)
      setIsExpanded(false);
      setSemanticResults([]); // Clear semantic results when collapsed or slash command
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-base-dark/50 backdrop-blur-sm flex justify-center z-[100]"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: -50, scale: 0.95, opacity: 0, height: "64px" }} // Initial height for just the search bar
        animate={
          isExpanded
            ? { y: 0, scale: 1, opacity: 1, height: "60vh" }
            : { y: -50, scale: 0.95, opacity: 1, height: "64px" }
        } // Animate height
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative mt-[15vh] w-full max-w-2xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 p-4 border-b border-border-light dark:border-border-dark">
          <Search
            size={20}
            className="text-text-light-sub dark:text-text-dark-sub flex-shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Search or type a command..."
            className="flex-1 bg-transparent outline-none text-base text-text-light dark:text-text-dark placeholder:text-text-light-sub dark:placeholder:text-text-dark-sub"
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </div>

        <AnimatePresence>
          {isExpanded && ( // Only render results if expanded
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-y-auto p-2 flex-1" // Use flex-1 to make it take remaining space
            >
              {flatResults.length > 0 ? (
                <ul className="space-y-1">
                  {Object.entries(groupedResults).map(([type, items]) => (
                    <li key={type}>
                      <h3 className="px-3 py-1.5 text-xs font-semibold text-text-light-sub dark:text-text-dark-sub">
                        {type}
                      </h3>
                      <ul className="space-y-1">
                        {items.map((item, index) => {
                          const globalIndex = flatResults.findIndex(
                            (fr) => fr === item
                          );
                          return (
                            <li key={`${item.title}-${globalIndex}`}>
                              <button
                                ref={(el) =>
                                  (itemRefs.current[globalIndex] = el)
                                }
                                onClick={() => handleSelect(item)}
                                className={clsx(
                                  "flex w-full text-left items-center gap-4 p-3 rounded-lg transition-colors",
                                  {
                                    "bg-tertiary-light dark:bg-tertiary-dark":
                                      highlightedIndex === globalIndex,
                                    "hover:bg-tertiary-light dark:hover:bg-tertiary-dark":
                                      highlightedIndex !== globalIndex,
                                  }
                                )}
                              >
                                <div className="w-5 flex justify-center items-center flex-shrink-0">
                                  <item.icon
                                    size={18}
                                    className="text-info flex-shrink-0"
                                  />
                                </div>

                                {/* Conditional rendering for specific types */}
                                {item.type === "Goal" ? (
                                  <GoalSearchResult item={item} />
                                ) : item.type === "ProgressLog" ? (
                                  <div className="flex flex-col flex-1 overflow-hidden">
                                    <span className="text-sm font-medium text-text-light dark:text-text-dark truncate">
                                      {item.title}
                                    </span>
                                    {item.goal_title && (
                                      <span className="text-xs text-text-light-sub dark:text-text-dark-sub truncate">
                                        Goal: {item.goal_title}
                                      </span>
                                    )}
                                    {item.content && (
                                      <span className="text-xs text-text-light-sub dark:text-text-dark-sub truncate">
                                        {item.content}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex flex-col flex-1 overflow-hidden">
                                    <span className="text-sm font-medium text-text-light dark:text-text-dark truncate">
                                      {item.title}
                                    </span>
                                    {item.content && (
                                      <span className="text-xs text-text-light-sub dark:text-text-dark-sub truncate">
                                        {item.content}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {highlightedIndex === globalIndex && (
                                  <span className="ml-auto text-xs text-text-light-sub dark:text-text-dark-sub flex items-center gap-1">
                                    <CornerDownLeft size={12} /> Enter
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : isSearching ? (
                <div className="text-center py-12 text-text-light-sub dark:text-text-dark-sub flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Searching memories...</span>
                </div>
              ) : (
                <div className="text-center py-12 text-text-light-sub dark:text-text-dark-sub">
                  <p>No results for "{query}"</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
