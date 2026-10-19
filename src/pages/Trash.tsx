import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, RotateCcw, Target } from "lucide-react";
import { useToast } from "../hooks/useToast";
import HoldButton from "../components/HoldButton";
import {
  deletedAgoLabel,
  goneForGoodLabel,
  GOING_SOON_DAYS,
} from "../utils/trashLabels";
import {
  trashService,
  type PurgeResult,
  type TrashContents,
  type TrashProgress,
  type TrashSelection,
} from "../api/trashService";

type Pending = { kind: "forever" | "empty"; selection: TrashSelection } | null;

const key = (type: "e" | "g", id: number) => `${type}:${id}`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const dayOfMonth = (iso: string) =>
  String(new Date(iso).getDate()).padStart(2, "0");
const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
const dayAndMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Deleted entries and goals, kept 30 days. Each row can be restored or deleted
 * for good, several can be picked at once, and the whole trash can be emptied.
 * Deleting for good asks you to hold a button, and says what it takes with it.
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

  const selection = useMemo<TrashSelection>(
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

  const restore = async (which: TrashSelection) => {
    setBusy(true);
    try {
      const r = await trashService.restore(which);
      await finish(`Restored ${r.entries + r.goals} item(s)`);
    } catch (err) {
      console.error(err);
      setBusy(false);
      showToast("Could not restore", "danger");
    }
  };

  const purge = async (run: () => Promise<PurgeResult>, items: number) => {
    setBusy(true);
    setProgress({ done: 0, total: items });
    try {
      const r = await run();
      await finish(
        r.searchCleanupPending > 0
          ? "Deleted. Search will finish clearing them when it is running."
          : r.filesPending > 0
            ? "Deleted. A few files are in use and will be removed the next time MindSage starts."
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

  const confirmDelete = () => {
    if (!pending) return;
    if (pending.kind === "empty") purge(() => trashService.empty(), total);
    else
      purge(
        () => trashService.deleteForever(pending.selection),
        pending.selection.entryIds.length + pending.selection.goalIds.length,
      );
  };

  const pendingCount = pending
    ? pending.kind === "empty"
      ? total
      : pending.selection.entryIds.length + pending.selection.goalIds.length
    : 0;

  const outlined =
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  const neutral = `${outlined} border-border-light dark:border-border-dark text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark`;
  const danger = `${outlined} border-danger/60 text-danger hover:bg-danger/10`;

  const chip = (days: number) => (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
        days <= GOING_SOON_DAYS
          ? "bg-warning/20 text-text-light dark:text-text-dark"
          : "bg-tertiary-light dark:bg-tertiary-dark text-text-light-sub dark:text-text-dark-sub"
      }`}
      data-testid="days-left"
    >
      {goneForGoodLabel(days)}
    </span>
  );

  const actions = (which: TrashSelection, label: string) => (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={() => restore(which)}
        disabled={busy}
        aria-label={`Restore ${label}`}
        className={neutral}
      >
        <RotateCcw size={14} aria-hidden /> Restore
      </button>
      <button
        onClick={() => setPending({ kind: "forever", selection: which })}
        disabled={busy}
        aria-label={`Delete ${label} forever`}
        className={danger}
      >
        Delete forever
      </button>
    </div>
  );

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      <Link
        to="/journals"
        className="inline-flex items-center gap-1 text-sm text-text-light-sub dark:text-text-dark-sub hover:text-text-light dark:hover:text-text-dark"
      >
        <ChevronLeft size={16} aria-hidden /> Journal
      </Link>

      <header className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-text-light dark:text-text-dark">
            Trash
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-text-light-sub dark:text-text-dark-sub">
            Deleted entries and goals wait here for {trash?.retentionDays ?? 30}{" "}
            days, with their photos and voice notes, then they&apos;re gone for
            good. Entries in Trash don&apos;t appear in Search or Ask.
          </p>
        </div>
        <button
          onClick={() =>
            setPending({
              kind: "empty",
              selection: { entryIds: [], goalIds: [] },
            })
          }
          disabled={busy || total === 0}
          className={danger}
        >
          Empty trash…
        </button>
      </header>

      {total > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2 text-text-light-sub dark:text-text-dark-sub">
            <input
              type="checkbox"
              checked={selectedCount === total}
              onChange={selectAll}
              disabled={busy}
            />
            Select all
          </label>
          {selectedCount > 0 && (
            <>
              <span
                className="text-text-light dark:text-text-dark"
                role="status"
              >
                {selectedCount} selected
              </span>
              <button
                onClick={() => restore(selection)}
                disabled={busy}
                className={neutral}
              >
                <RotateCcw size={14} aria-hidden /> Restore selected
              </button>
              <button
                onClick={() =>
                  setPending({ kind: "forever", selection: { ...selection } })
                }
                disabled={busy}
                className={danger}
              >
                Delete selected forever
              </button>
            </>
          )}
        </div>
      )}

      {pending && (
        <div
          role="alertdialog"
          aria-label="Confirm deleting for good"
          className="mb-6 rounded-xl border border-danger/40 bg-danger/5 p-4"
        >
          <p className="text-sm text-text-light dark:text-text-dark">
            {pending.kind === "empty"
              ? `Delete all ${total} item(s) in the trash for good?`
              : `Delete ${plural(pendingCount, "item")} for good?`}{" "}
            Their text, photos and recordings are removed from MindSage and from
            search. This cannot be undone. Backups made earlier still hold them.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <HoldButton
              label={
                pending.kind === "empty"
                  ? "Hold to empty trash"
                  : "Hold to delete forever"
              }
              holdingLabel="Keep holding…"
              onComplete={confirmDelete}
              disabled={busy}
            />
            <button
              onClick={() => setPending(null)}
              disabled={busy}
              className={neutral}
            >
              Cancel
            </button>
            <span className="text-xs text-text-light-sub dark:text-text-dark-sub">
              Hold for a moment. Enter works too.
            </span>
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
        <div className="py-24 text-center text-text-light-sub dark:text-text-dark-sub">
          <p className="font-medium">The trash is empty</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {trash?.entries.map((e) => {
            const name = e.title || `Untitled · ${dayAndMonth(e.created_at)}`;
            const extras = [
              e.has_image ? "1 photo" : null,
              e.has_audio ? "1 voice note" : null,
            ].filter(Boolean);
            return (
              <li
                key={key("e", e.id)}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark p-4"
              >
                <input
                  type="checkbox"
                  checked={selected.has(key("e", e.id))}
                  onChange={() => toggle(key("e", e.id))}
                  aria-label={`Select ${e.title || "untitled entry"}`}
                />
                <div
                  className="w-12 shrink-0 text-center leading-tight"
                  aria-hidden
                >
                  <div className="font-display text-2xl text-text-light dark:text-text-dark">
                    {dayOfMonth(e.created_at)}
                  </div>
                  <div className="text-xs text-text-light-sub dark:text-text-dark-sub">
                    {weekday(e.created_at)}
                  </div>
                </div>
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text-light dark:text-text-dark">
                      {name}
                    </span>
                    {chip(e.days_left)}
                  </div>
                  <p className="mt-0.5 truncate font-display text-[15px] text-text-light-sub dark:text-text-dark-sub">
                    {e.preview}
                  </p>
                  <p className="mt-0.5 text-xs text-text-light-sub dark:text-text-dark-sub">
                    {[
                      shortDate(e.created_at),
                      deletedAgoLabel(e.deleted_at),
                      ...extras,
                    ].join(" · ")}
                  </p>
                </div>
                {actions({ entryIds: [e.id], goalIds: [] }, name)}
              </li>
            );
          })}
          {trash?.goals.map((g) => (
            <li
              key={key("g", g.id)}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border-light dark:border-border-dark bg-secondary-light dark:bg-secondary-dark p-4"
            >
              <input
                type="checkbox"
                checked={selected.has(key("g", g.id))}
                onChange={() => toggle(key("g", g.id))}
                aria-label={`Select goal ${g.title}`}
              />
              <div
                className="flex w-12 shrink-0 justify-center text-text-light-sub dark:text-text-dark-sub"
                aria-hidden
              >
                <Target size={24} />
              </div>
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text-light dark:text-text-dark">
                    {g.title}
                  </span>
                  {chip(g.days_left)}
                </div>
                <p className="mt-0.5 truncate font-display text-[15px] text-text-light-sub dark:text-text-dark-sub">
                  {g.description ||
                    `${g.current_value} of ${g.target_value} ${g.unit}`}
                </p>
                <p className="mt-0.5 text-xs text-text-light-sub dark:text-text-dark-sub">
                  {[
                    "Goal",
                    deletedAgoLabel(g.deleted_at),
                    g.log_count > 0 ? plural(g.log_count, "check-in") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {actions({ entryIds: [], goalIds: [g.id] }, g.title)}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 max-w-3xl text-xs text-text-light-sub dark:text-text-dark-sub">
        Delete forever and Empty trash can&apos;t be undone, so they ask you to
        hold for a moment. Enter works too. Deleting forever also clears the
        entry from the search index on this PC.
      </p>
    </main>
  );
}
