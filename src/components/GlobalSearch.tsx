import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, X, BookOpen, Target, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { actionsCommands, settingsCommands } from "../utils/SearchActions";

export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const navigate = useNavigate();

  // Refs for list items
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Combine all searchable items into a single list using useMemo
  const allSearchableItems = useMemo(
    () => [...actionsCommands, ...settingsCommands],
    [navigate]
  );

  // Auto-focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape key closes search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Filter results by title/keywords or slash commands
  const filteredResults = useMemo(() => {
    if (!query) return allSearchableItems;

    if (query.startsWith("/")) {
      return [{ type: "SlashCommand", title: `Go to ${query}`, path: query }];
    }

    const searchTerm = query.toLowerCase();
    return allSearchableItems.filter((item) => {
      const inTitle = item.title.toLowerCase().includes(searchTerm);
      const inKeywords =
        item.keywords?.some((keyword: string) =>
          keyword.toLowerCase().includes(searchTerm)
        ) ?? false;
      return inTitle || inKeywords;
    });
  }, [query, allSearchableItems]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [highlightedIndex, filteredResults]);

  // Handles selecting an item
  const handleSelect = (
    item:
      | (typeof allSearchableItems)[0]
      | { path?: string; title: string; type: string }
  ) => {
    if (item.action) item.action();
    else if (item.path) navigate(item.path);
    onClose();
  };

  // Keyboard navigation
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        Math.min(prev + 1, filteredResults.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredResults[highlightedIndex]) {
        handleSelect(filteredResults[highlightedIndex]);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-base-dark/50 backdrop-blur-sm flex justify-center z-[100]"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: -50, scale: 0.95, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: -50, scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative mt-[15vh] max-h-[60vh] w-full max-w-2xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-4 p-4 border-b border-border-light dark:border-border-dark">
          <Search
            size={20}
            className="text-text-light-sub dark:text-text-dark-sub flex-shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
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

        {/* Search Results */}
        <div className="overflow-y-auto p-2">
          {filteredResults.length > 0 ? (
            <ul>
              {filteredResults.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <button
                    ref={(el) => (itemRefs.current[index] = el)}
                    onClick={() => handleSelect(item)}
                    className={`flex items-center w-full text-left gap-4 p-3 rounded-lg transition-colors ${
                      highlightedIndex === index
                        ? "bg-tertiary-light dark:bg-tertiary-dark"
                        : "hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
                    }`}
                  >
                    {item.icon && (
                      <item.icon
                        size={18}
                        className="text-text-light-sub dark:text-text-dark-sub flex-shrink-0"
                      />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-text-light dark:text-text-dark">
                        {item.title}
                      </span>
                      <span className="text-xs text-text-light-sub dark:text-text-dark-sub">
                        {item.type}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12 text-text-light-sub dark:text-text-dark-sub">
              <p>No results for "{query}"</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
