import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trash2, Target, BookOpen } from "lucide-react";
import { useToast } from "../hooks/useToast";
import { daysLeftLabel } from "../utils/trashLabels";
import {
  trashService,
  type PurgeResult,
  type TrashContents,
  type TrashProgress,
} from "../api/trashService";

type Pending = "forever" | "empty" | null;

const key = (type: "e" | "g", id: number) => `${type}:${id}`;

/**
 * Deleted entries and goals, kept 30 days. Select some to restore them or
 * delete them for good, or empty the whole trash. Deleting for good asks first,
 * and says what it takes with it.
 */
export default function Trash() {
  const { showToast } = useToast();
  const [trash, setTrash] = useState<TrashContents | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TrashProgress | null>(null);

  const load = useCallback(async () => {
    try {
      setTrash(await trashService.list());
    } catch (err) {
      console.error("Could not load the trash:", err);
      showToast("The trash could not be loaded", "danger");
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => trashService.onProgress(setProgress), []);

  const total = (trash?.entries.length ?? 0) + (trash?.goals.length ?? 0);

  const selection = useMemo(
    () => ({
      entryIds: (trash?.entries ?? [])
        .filter((e) => selected.has(key("e", e.id)))
        .map((e) => e.id),
      goalIds: (trash?.goals ?? [])
        .filter((g) => selected.has(key("g", g.id)))
        .map((g) => g.id),
    }),
    [trash, selected],
  );
  const selectedCount = selection.entryIds.length + selection.goalIds.length;

  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const selectAll = () =>
    setSelected(
      selectedCount === total
        ? new Set()
        : new Set([
            ...(trash?.entries ?? []).map((e) => key("e", e.id)),
            ...(trash?.goals ?? []).map((g) => key("g", g.id)),
          ]),
    );

  const finish = async (message: string) => {
    setSelected(new Set());
    setPending(null);
    setProgress(null);
    setBusy(false);
    showToast(message, "success");
    await load();
  };

  const restore = async () => {
    setBusy(true);
    try {
      const r = await trashService.restore(selection);
      await finish(`Restored ${r.entries + r.goals} item(s)`);
    } catch (err) {
      console.error(err);
      setBusy(false);
      showToast("Could not restore", "danger");
    }
  };

  const purge = async (run: () => Promise<PurgeResult>) => {
    setBusy(true);
    setProgress({
      done: 0,
      total: pending === "empty" ? total : selectedCount,
    });
    try {
      const r = await run();
      await finish(
        r.searchCleanupPending > 0
          ? "Deleted. Search will finish clearing them when it is running."
          : `Deleted ${r.entries + r.goals} item(s) for good`,
      );
    } catch (err) {
      console.error(err);
      setPending(null);
      setProgress(null);
      setBusy(false);
      showToast("Could not delete", "danger");
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            to="/journals"
            aria-label="Back to journals"
            className="p-2 rounded-full hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-text-light dark:text-text-dark">
              Trash
            </h1>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Deleted items are kept {trash?.retentionDays ?? 30} days, then
              removed for good.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={selectAll}
            disabled={busy || total === 0}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-border-light dark:border-border-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark disabled:opacity-50"
          >
            {selectedCount === total && total > 0
              ? "Clear selection"
              : "Select all"}
          </button>
          <button
            onClick={restore}
            disabled={busy || selectedCount === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-light1 dark:bg-dark1 text-white disabled:opacity-50"
          >
            <RotateCcw size={16} /> Restore
          </button>
          <button
            onClick={() => setPending("forever")}
            disabled={busy || selectedCount === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-danger text-white disabled:opacity-50"
          >
            <Trash2 size={16} /> Delete forever
          </button>
          <button
            onClick={() => setPending("empty")}
            disabled={busy || total === 0}
            className="px-3 py-2 text-sm font-semibold rounded-lg text-danger border border-danger/40 hover:bg-danger/10 disabled:opacity-50"
          >
            Empty trash
          </button>
        </div>
      </header>

      {pending && (
        <div
          role="alertdialog"
          aria-label="Confirm deleting for good"
          className="mb-6 rounded-xl border border-danger/40 bg-danger/5 p-4"
        >
          <p className="text-sm text-text-light dark:text-text-dark">
            {pending === "empty"
              ? `Delete all ${total} item(s) in the trash for good?`
              : `Delete the ${selectedCount} selected item(s) for good?`}{" "}
            Their text, photos and recordings are removed from this computer and
            from search. This cannot be undone. Backups made earlier still hold
            them.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() =>
                purge(() =>
                  pending === "empty"
                    ? trashService.empty()
                    : trashService.deleteForever(selection),
                )
              }
              disabled={busy}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-danger text-white disabled:opacity-50"
            >
              {pending === "empty" ? "Empty trash" : "Delete forever"}
            </button>
            <button
              onClick={() => setPending(null)}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border-light dark:border-border-dark"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {busy && progress && progress.total > 0 && (
        <div className="mb-6" role="status">
          <progress
            value={progress.done}
            max={progress.total}
            aria-label="Deleting"
            className="w-full h-2"
          />
          <p className="mt-1 text-xs text-text-light-sub dark:text-text-dark-sub">
            {progress.done} of {progress.total}
          </p>
        </div>
      )}

      {trash && total === 0 ? (
        <div className="text-center py-24 text-text-light-sub dark:text-text-dark-sub">
          <Trash2 className="mx-auto mb-3" size={32} />
          <p className="font-medium">The trash is empty</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {trash?.entries.map((e) => (
            <li key={key("e", e.id)}>
              <label className="flex items-start gap-3 p-4 rounded-xl border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(key("e", e.id))}
                  onChange={() => toggle(key("e", e.id))}
                  aria-label={`Select ${e.title || "untitled entry"}`}
                  className="mt-1"
                />
                <BookOpen size={18} className="mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate text-text-light dark:text-text-dark">
                    {e.title || "Untitled entry"}
                  </span>
                  <span className="block text-sm truncate text-text-light-sub dark:text-text-dark-sub">
                    {e.preview}
                  </span>
                </span>
                <span
                  className="shrink-0 text-xs font-medium px-2 py-1 rounded-full bg-tertiary-light dark:bg-tertiary-dark"
                  data-testid="days-left"
                >
                  {daysLeftLabel(e.days_left)}
                </span>
              </label>
            </li>
          ))}
          {trash?.goals.map((g) => (
            <li key={key("g", g.id)}>
              <label className="flex items-start gap-3 p-4 rounded-xl border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(key("g", g.id))}
                  onChange={() => toggle(key("g", g.id))}
                  aria-label={`Select goal ${g.title}`}
                  className="mt-1"
                />
                <Target size={18} className="mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate text-text-light dark:text-text-dark">
                    {g.title}
                  </span>
                  <span className="block text-sm text-text-light-sub dark:text-text-dark-sub">
                    Goal · {g.current_value} of {g.target_value} {g.unit}
                  </span>
                </span>
                <span
                  className="shrink-0 text-xs font-medium px-2 py-1 rounded-full bg-tertiary-light dark:bg-tertiary-dark"
                  data-testid="days-left"
                >
                  {daysLeftLabel(g.days_left)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
