import { useState, useEffect, useCallback, useRef } from "react";
import QuickCaptureTitleBar from "./QuickCaptureTitleBar";
import { Loader2, Save } from "lucide-react";
import journalService, { type JournalEntry } from "../api/journalService";
import { useAuth } from "../hooks/useAuth";
import { toast } from "react-hot-toast";

export default function QuickCapture() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const authMode = (localStorage.getItem("authMode") || "offline") as
    "offline" | "online";
  const { accessToken } = useAuth();

  const contentInputRef = useRef<HTMLTextAreaElement>(null);

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
        content,
        title: title.trim(),
        mood_score: 0,
        mood_tags: [],
      };

      const res = await journalService.create(
        authMode,
        accessToken!,
        mergedEntry,
      );

      await window.electron.ipcRenderer.invoke("qdrant:sync-journal", res.id);
      toast.success("Journal entry saved!");

      setTitle("");
      setContent("");
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

  useEffect(() => {
    contentInputRef.current?.focus();
  }, []);

  const isSaveDisabled = !content.trim() || isSaving;

  return (
    <div className="flex flex-col h-screen bg-surface-light dark:bg-surface-dark rounded-lg overflow-hidden border border-border-light dark:border-border-dark">
      <QuickCaptureTitleBar />

      <div className="flex-1 flex flex-col min-h-0 gap-2 px-3 pb-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          disabled={isSaving}
          className="w-full shrink-0 bg-transparent px-1 font-display text-lg font-semibold text-text-light outline-none placeholder:text-text-light-sub disabled:opacity-60 dark:text-text-dark dark:placeholder:text-text-dark-sub"
        />

        <textarea
          ref={contentInputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your quick thought..."
          disabled={isSaving}
          className="min-h-0 w-full flex-1 resize-none rounded-lg bg-tertiary-light p-3 text-sm leading-relaxed text-text-light outline-none placeholder:text-text-light-sub disabled:opacity-60 dark:bg-tertiary-dark dark:text-text-dark dark:placeholder:text-text-dark-sub"
        />

        <div className="flex shrink-0 items-center justify-between pt-1">
          <span className="text-[11px] text-text-light-sub dark:text-text-dark-sub">
            Ctrl/Cmd + Enter to save
          </span>
          <button
            onClick={performSave}
            disabled={isSaveDisabled}
            className="flex items-center gap-1.5 rounded-lg bg-light1 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-dark1"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
