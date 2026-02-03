import { useState, useEffect, useCallback, useRef } from "react";
import QuickCaptureTitleBar from "./QuickCaptureTitleBar";
import { Plus, Loader2, Save } from "lucide-react";
import journalService, { type JournalEntry } from "../api/journalService";
import { useAuth } from "../hooks/useAuth";
import { toast } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";

export default function QuickCapture() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hasTitle, setHasTitle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFocused, setIsFocused] = useState(false); // New state to track if any input is focused

  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";
  const { accessToken } = useAuth();

  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the main content container

  const handleCloseWindow = useCallback(async () => {
    await window.electron.ipcRenderer.invoke("quick-capture:close");
  }, []);

  const performSave = useCallback(async () => {
    if (!content.trim() || isSaving) {
      if (!content.trim()) toast.error("Entry content cannot be empty.");
      return;
    }

    setIsSaving(true);

    try {
      const mergedEntry: JournalEntry = {
        content: content,
        title: title?.trim() ? title : "",
        mood_score: 0,
        mood_tags: [],
      };

      const res = await journalService.create(
        authMode,
        accessToken!,
        mergedEntry
      );

      await window.electron.ipcRenderer.invoke("qdrant:sync-journal", res.id);
      console.log("Saving successful:", { title, content, entryId: res.id });
      toast.success("Journal entry saved!");

      // Clear fields and close after successful save
      setTitle("");
      setContent("");
      setHasTitle(false);
      setIsFocused(false); // Reset focus state
      handleCloseWindow();
    } catch (error) {
      console.error("Error saving quick capture entry:", error);
      toast.error("Failed to save entry. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [title, content, authMode, accessToken, isSaving, handleCloseWindow]);

  // Keyboard shortcut for manual save (Ctrl/Cmd + Enter)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        performSave();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [performSave]);

  // Effect to manage the overall focus state
  useEffect(() => {
    const handleFocusIn = () => setIsFocused(true);
    const handleFocusOut = (event: FocusEvent) => {
      // Check if focus moved outside the entire quick capture container
      if (
        containerRef.current &&
        !containerRef.current.contains(event.relatedTarget as Node)
      ) {
        setIsFocused(false);
      }
    };

    const containerElement = containerRef.current;
    if (containerElement) {
      containerElement.addEventListener("focusin", handleFocusIn);
      containerElement.addEventListener("focusout", handleFocusOut);
    }

    // Auto-focus the content area on mount
    contentInputRef.current?.focus();

    return () => {
      if (containerElement) {
        containerElement.removeEventListener("focusin", handleFocusIn);
        containerElement.removeEventListener("focusout", handleFocusOut);
      }
    };
  }, []);

  // When title is revealed, focus the title input
  useEffect(() => {
    if (hasTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [hasTitle]);

  const baseInputClasses =
    "w-full bg-transparent text-text-light dark:text-text-dark placeholder:text-text-light-sub dark:placeholder:text-text-dark-sub outline-none transition-all duration-200 ease-in-out";
  const titleInputClasses = `${baseInputClasses} font-semibold text-base p-2`;
  const contentInputClasses = `${baseInputClasses} flex-1 text-sm resize-none px-3`;

  // Determine if the save button should be visible
  const showSaveButton =
    (isFocused || content.trim().length > 0 || title.trim().length > 0) &&
    !isSaving;
  const isSaveDisabled = !content.trim() || isSaving; // Disable if content is empty or saving

  return (
    <div className="flex flex-col h-screen bg-surface-light dark:bg-surface-dark rounded-lg overflow-hidden border border-border-light dark:border-border-dark">
      <QuickCaptureTitleBar />

      <div ref={containerRef} className="flex-1 flex flex-col p-2 pt-0">
        <div className="flex flex-col flex-1 relative bg-tertiary-light dark:bg-tertiary-dark rounded-lg transition-all ">
          {/* Header area with icon and optional title input/toggle */}
          <div className="flex items-center p-1">
            {hasTitle ? (
              <input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Entry title"
                className={titleInputClasses}
                disabled={isSaving}
              />
            ) : (
              // Only show 'Add title' button if not focused and no title already, or if focused
              (isFocused || content.trim().length > 0) && (
                <button
                  onClick={() => {
                    setHasTitle(true);
                  }}
                  className="flex items-center rounded-full hover:bg-base-light p-1 dark:hover:bg-base-dark gap-1 text-sm text-text-light-sub dark:text-text-dark-sub hover:text-info focus:outline-none"
                  disabled={isSaving}
                >
                  <Plus size={14} />
                </button>
              )
            )}
          </div>

          {/* Textarea for content */}
          <textarea
            ref={contentInputRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your quick thought... (Ctrl/Cmd + Enter to save)"
            rows={hasTitle ? 5 : 7}
            className={`${contentInputClasses} ${hasTitle ? "pt-0" : "pt-2"}`}
            disabled={isSaving}
            style={{ paddingBottom: showSaveButton ? "2.5rem" : "1rem" }} // Make space for the button
          />

          {/* Integrated Save Button */}
          <AnimatePresence>
            {showSaveButton && (
              <motion.button
                key="save-button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                onClick={performSave}
                disabled={isSaveDisabled}
                className="absolute bottom-3 cursor-pointer right-3 text-white font-semibold p-1.5 rounded-md text-sm hover:bg-base-light dark:hover:bg-base-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="animate-spin h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
