import { useState, useEffect, useCallback, useRef } from "react";
import QuickCaptureTitleBar from "./QuickCaptureTitleBar";
import { Loader2, Save, LogIn } from "lucide-react";
import journalService, { type JournalEntry } from "../api/journalService";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";

/**
 * Quick capture used to hold the entry in component state and nowhere else,
 * so a failed save, an Escape press or the close button lost whatever had
 * been typed. The draft is persisted instead, which makes closing the window
 * non-destructive: this window shares an origin with the main one, so the
 * text is still here the next time the shortcut is pressed.
 */
const DRAFT_KEY = "draft-quick-capture";
const DRAFT_DEBOUNCE_MS = 1500;

export default function QuickCapture() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const { user: sessionUser, checking } = useAuth();
  const { showToast } = useToast();

  const contentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) {
        const draft = JSON.parse(stored) as {
          title?: string;
          content?: string;
        };
        setTitle(draft.title ?? "");
        setContent(draft.content ?? "");
      }
    } catch (err) {
      console.error("[QuickCapture] Could not restore the draft:", err);
    } finally {
      // Guards the autosave below, so an unreadable draft is never written
      // back over a readable one.
      setIsDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isDraftLoaded) return;
    const timer = setTimeout(() => {
      try {
        if (!title && !content) {
          localStorage.removeItem(DRAFT_KEY);
          return;
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content }));
      } catch (err) {
        console.error("[QuickCapture] Could not save the draft:", err);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [title, content, isDraftLoaded]);

  const handleCloseWindow = useCallback(async () => {
    await window.electron.ipcRenderer.invoke("quick-capture:close");
  }, []);

  const performSave = useCallback(async () => {
    if (!content.trim() || isSaving) {
      if (!content.trim())
        showToast("Entry content cannot be empty.", "warning");
      return;
    }
    if (!sessionUser) {
      showToast("Sign in to MindSage before saving.", "warning");
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

      const res = await journalService.create(mergedEntry);

      await window.electron.ipcRenderer.invoke("qdrant:sync-journal", res.id);
      showToast("Journal entry saved.", "success");

      localStorage.removeItem(DRAFT_KEY);
      setTitle("");
      setContent("");
      handleCloseWindow();
    } catch (error) {
      console.error("Error saving quick capture entry:", error);
      // A fixed message rather than errorMessage(): what surfaces here is the
      // raw IPC rejection ("Error invoking remote method 'journal:create'..."),
      // which tells the user nothing and hides the part they need, which is
      // that their text was kept. The real error goes to the console above.
      showToast("Could not save the entry. Your text is kept.", "danger");
    } finally {
      setIsSaving(false);
    }
  }, [title, content, sessionUser, isSaving, handleCloseWindow, showToast]);

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

  // Until the main process answers, say nothing rather than flash "signed
  // out" at someone who is signed in.
  if (checking) {
    return (
      <div className="h-screen rounded-lg border border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark" />
    );
  }

  // The global shortcut opens this window whether or not anyone is signed in.
  // Showing no writing surface keeps a signed-out user from typing a thought
  // that a save would then refuse.
  if (!sessionUser) {
    return (
      <div className="flex h-screen flex-col overflow-hidden rounded-lg border border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark">
        <QuickCaptureTitleBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-light bg-secondary-light text-text-light-sub dark:border-border-dark dark:bg-secondary-dark dark:text-text-dark-sub">
            <LogIn size={18} />
          </div>
          <p className="font-display text-lg font-semibold text-text-light dark:text-text-dark">
            You are signed out
          </p>
          <p className="max-w-xs text-sm leading-relaxed text-text-light-sub dark:text-text-dark-sub">
            Open MindSage and sign in, then press the shortcut again to capture
            a thought.
          </p>
        </div>
      </div>
    );
  }

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
