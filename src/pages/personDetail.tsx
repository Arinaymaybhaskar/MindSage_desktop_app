import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  EyeOff,
  GitMerge,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { peopleService } from "../api/peopleService";
import type {
  PersonCard,
  PersonDetail as Detail,
  PersonSummary,
  Relationship,
} from "../types/People";
import { RELATIONSHIPS } from "../types/People";
import FeelingSparkline from "../components/people/FeelingSparkline";
import {
  relationshipLabel,
  TREND_MIN,
  valenceLabel,
} from "../components/people/labels";
import Modal from "../components/Modal";
import { useToast } from "../hooks/useToast";
import { useClickOutside } from "../hooks/useClickOutside";

type Dialog = "rename" | "nickname" | "merge" | "stop" | "delete" | null;

const card =
  "p-6 rounded-2xl bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark";

function MentionsByMonth({ data }: { data: Detail["mentionsByMonth"] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-1 h-16" aria-label="Mentions per month">
      {data.slice(-12).map((d) => (
        <div
          key={d.month}
          className="flex-1 min-w-[10px] rounded-t bg-light1/70 dark:bg-dark1/70"
          style={{ height: `${Math.max(8, (d.count / max) * 100)}%` }}
          title={`${d.month}: ${d.count}`}
        />
      ))}
    </div>
  );
}

export default function PersonDetail() {
  const { id } = useParams();
  const personId = Number(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [person, setPerson] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PersonSummary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [others, setOthers] = useState<PersonCard[]>([]);
  const [mergeTarget, setMergeTarget] = useState<number | "">("");
  const [ignoreOnDelete, setIgnoreOnDelete] = useState(true);
  const [undo, setUndo] = useState<{ token: string; name: string } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  const load = useCallback(async () => {
    try {
      const p = await peopleService.get(personId);
      setPerson(p);
      setSummary(p.summary);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Could not load this person");
    }
  }, [personId]);

  useEffect(() => {
    load();
    const unsubscribe = peopleService.onChanged(() => load());
    return () => unsubscribe();
  }, [load]);

  const summarize = useCallback(async () => {
    setSummarizing(true);
    try {
      setSummary(await peopleService.summarize(personId));
    } catch (err) {
      console.error("Summary failed:", err);
    } finally {
      setSummarizing(false);
    }
  }, [personId]);

  // Summaries are made on demand: when the page opens and the mentions have
  // changed since the last one.
  const needsSummary =
    !!person &&
    person.mentionCount >= 2 &&
    (!person.summary || person.summary.stale);
  useEffect(() => {
    if (needsSummary) summarize();
  }, [needsSummary, summarize]);

  const act = async (action: () => Promise<unknown>, message?: string) => {
    try {
      await action();
      if (message) showToast(message, "success");
      setDialog(null);
      setText("");
      await load();
    } catch (err) {
      showToast((err as Error).message || "Something went wrong", "danger");
    }
  };

  const open = async (d: Dialog) => {
    setMenuOpen(false);
    setText(d === "rename" ? (person?.displayName ?? "") : "");
    if (d === "merge") {
      const list = await peopleService.list();
      setOthers(list.filter((p) => p.id !== personId));
      setMergeTarget("");
    }
    setDialog(d);
  };

  if (error) {
    return (
      <div className="p-8 text-center text-text-light dark:text-text-dark">
        <p>{error}</p>
        <button
          onClick={() => navigate("/people")}
          className="mt-4 px-4 py-2 rounded-xl bg-secondary-light dark:bg-secondary-dark"
        >
          Back to People
        </button>
      </div>
    );
  }
  if (!person) return null;

  const otherNames = person.aliases.filter(
    (a) => a.toLowerCase() !== person.displayName.toLowerCase(),
  );

  const menuItems: [Dialog, string, React.ReactNode][] = [
    ["rename", "Rename", <Pencil size={14} key="i" />],
    ["nickname", "Add nickname", <Plus size={14} key="i" />],
    ["merge", "Merge with another person", <GitMerge size={14} key="i" />],
    ["stop", "Stop tracking this person", <EyeOff size={14} key="i" />],
    ["delete", "Delete person and their data", <Trash2 size={14} key="i" />],
  ];

  return (
    <div className="bg-base-light dark:bg-base-dark text-text-light dark:text-text-dark overflow-y-auto h-full">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32 space-y-6">
        <button
          onClick={() => navigate("/people")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary-light dark:bg-secondary-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition"
        >
          <ArrowLeft size={16} /> People
        </button>

        {undo && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-tertiary-light dark:bg-tertiary-dark text-sm">
            <span>
              Merged {undo.name} into {person.displayName}.
            </span>
            <button
              onClick={() =>
                act(async () => {
                  await peopleService.undoMerge(undo.token);
                  setUndo(null);
                }, "Merge undone")
              }
              className="font-semibold underline"
            >
              Undo
            </button>
          </div>
        )}

        <section className={card}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold">
                {person.displayName}
              </h1>
              {otherNames.length > 0 && (
                <p className="mt-1 text-sm text-text-light-sub dark:text-text-dark-sub">
                  Also written as {otherNames.join(", ")}
                </p>
              )}
            </div>
            <div className="relative" ref={menuRef}>
              <button
                aria-label="Person options"
                onClick={() => setMenuOpen((o) => !o)}
                className="p-2 rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <ul className="absolute right-0 mt-2 w-64 z-20 py-1 rounded-xl shadow-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark">
                  {menuItems.map(([key, label, icon]) => (
                    <li key={key}>
                      <button
                        onClick={() => open(key)}
                        className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-tertiary-light dark:hover:bg-tertiary-dark ${
                          key === "delete" ? "text-danger" : ""
                        }`}
                      >
                        {icon}
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <label
              htmlFor="relationship"
              className="text-text-light-sub dark:text-text-dark-sub"
            >
              Relationship
            </label>
            <select
              id="relationship"
              value={person.relationship ?? ""}
              onChange={(e) =>
                act(() =>
                  peopleService.update(person.id, {
                    relationship: (e.target.value ||
                      null) as Relationship | null,
                  }),
                )
              }
              className="px-2 py-1.5 rounded-lg bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark"
            >
              <option value="">Not set</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {relationshipLabel(r)}
                </option>
              ))}
            </select>
            {!person.relationship && person.relationshipSuggested && (
              <button
                onClick={() =>
                  act(() =>
                    peopleService.update(person.id, {
                      relationship: person.relationshipSuggested,
                    }),
                  )
                }
                className="px-2 py-1 rounded-lg bg-tertiary-light dark:bg-tertiary-dark"
              >
                Your entries say{" "}
                {relationshipLabel(person.relationshipSuggested).toLowerCase()}.
                Use it?
              </button>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className={card}>
            <h2 className="font-display text-lg font-semibold mb-1">
              Mentions over time
            </h2>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-4">
              {person.mentionCount}{" "}
              {person.mentionCount === 1 ? "entry" : "entries"}
            </p>
            <MentionsByMonth data={person.mentionsByMonth} />
          </section>
          <section className={card}>
            <h2 className="font-display text-lg font-semibold mb-1">
              How you felt when writing about {person.displayName}
            </h2>
            {person.trend.length ? (
              <>
                <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-4">
                  Rolling average. Each point opens its entry.
                </p>
                <FeelingSparkline
                  points={person.trend}
                  width={320}
                  height={64}
                  onPointClick={(entryId) =>
                    navigate(`/journal/view/${entryId}`)
                  }
                />
              </>
            ) : (
              <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
                Shows once there are {TREND_MIN} entries with a feeling noted.
              </p>
            )}
          </section>
        </div>

        <section className={card}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold">
              What you've written
            </h2>
            {summary && !summarizing && person.mentionCount >= 2 && (
              <button
                onClick={summarize}
                aria-label="Refresh summary"
                className="p-1.5 rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
          {summarizing ? (
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Reading your entries about {person.displayName}…
            </p>
          ) : summary?.lines.length ? (
            <ul className="space-y-3">
              {summary.lines.map((line, i) => (
                <li key={i} className="text-sm leading-relaxed">
                  {line.text}{" "}
                  {line.entryIds.map((entryId, n) => (
                    <button
                      key={entryId}
                      onClick={() => navigate(`/journal/view/${entryId}`)}
                      className="ml-1 px-1.5 py-0.5 rounded text-xs bg-tertiary-light dark:bg-tertiary-dark hover:underline"
                      title="Open the entry this line came from"
                    >
                      {n + 1}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              {person.mentionCount < 2
                ? "A summary appears once there are two entries to draw on."
                : "No summary yet."}
            </p>
          )}
        </section>

        <section className={card}>
          <h2 className="font-display text-lg font-semibold mb-4">
            Recent entries
          </h2>
          <ul className="space-y-3">
            {person.entries.slice(0, 30).map((e) => (
              <li key={e.entryId}>
                <button
                  onClick={() => navigate(`/journal/view/${e.entryId}`)}
                  className="w-full text-left p-4 rounded-xl bg-surface-light dark:bg-tertiary-dark hover:bg-tertiary-light dark:hover:bg-base-dark transition"
                >
                  <div className="flex justify-between gap-3 text-xs text-text-light-sub dark:text-text-dark-sub">
                    <span className="font-medium truncate">
                      {e.title || "Untitled entry"}
                    </span>
                    <span className="shrink-0">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {e.mentions.map((m) => (
                    <p key={m.id} className="mt-2 text-sm">
                      “{m.quote}”
                      <span className="ml-2 text-xs text-text-light-sub dark:text-text-dark-sub">
                        {valenceLabel(m.valence)}
                        {m.feelings.length ? ` · ${m.feelings.join(", ")}` : ""}
                      </span>
                    </p>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <Modal
          isOpen={dialog === "rename" || dialog === "nickname"}
          onClose={() => setDialog(null)}
          title={dialog === "rename" ? "Rename" : "Add a nickname"}
          size="sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog === "rename")
                act(() =>
                  peopleService.update(person.id, { displayName: text }),
                );
              else
                act(
                  () => peopleService.addAlias(person.id, text),
                  "Nickname added",
                );
            }}
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={dialog === "rename" ? "Name" : "e.g. Amma, Bubs"}
              className="w-full px-3 py-2 rounded-lg bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark"
            />
            {dialog === "nickname" && otherNames.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {otherNames.map((a) => (
                  <span
                    key={a}
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-tertiary-light dark:bg-tertiary-dark"
                  >
                    {a}
                    <button
                      type="button"
                      aria-label={`Remove ${a}`}
                      onClick={() =>
                        act(() => peopleService.removeAlias(person.id, a))
                      }
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={!text.trim()}
                className="px-4 py-2 rounded-lg bg-light1 dark:bg-dark1 text-white text-sm font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={dialog === "merge"}
          onClose={() => setDialog(null)}
          title={`Merge into ${person.displayName}`}
          size="sm"
        >
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-3">
            Their nicknames and mentions move to {person.displayName}. You can
            undo this until you close the app.
          </p>
          <select
            value={mergeTarget}
            onChange={(e) => setMergeTarget(Number(e.target.value) || "")}
            className="w-full px-3 py-2 rounded-lg bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark"
          >
            <option value="">Choose a person</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <div className="mt-4 flex justify-end">
            <button
              disabled={!mergeTarget}
              onClick={() => {
                const merged = others.find((p) => p.id === mergeTarget);
                act(async () => {
                  const res = await peopleService.merge(
                    person.id,
                    Number(mergeTarget),
                  );
                  setUndo({
                    token: res.undoToken,
                    name: merged?.displayName ?? "them",
                  });
                });
              }}
              className="px-4 py-2 rounded-lg bg-light1 dark:bg-dark1 text-white text-sm font-medium disabled:opacity-50"
            >
              Merge
            </button>
          </div>
        </Modal>

        <Modal
          isOpen={dialog === "stop"}
          onClose={() => setDialog(null)}
          title={`Stop tracking ${person.displayName}?`}
          size="sm"
        >
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-6">
            Everything People worked out about {person.displayName} is deleted,
            and the AI stops looking for their names. Your entries are not
            changed.
          </p>
          <div className="flex justify-end">
            <button
              onClick={() =>
                act(async () => {
                  await peopleService.ignore(person.id);
                  navigate("/people");
                }, "Stopped tracking")
              }
              className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium"
            >
              Stop tracking
            </button>
          </div>
        </Modal>

        <Modal
          isOpen={dialog === "delete"}
          onClose={() => setDialog(null)}
          title={`Delete ${person.displayName}?`}
          size="sm"
        >
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-4">
            Their mentions, nicknames and summary are deleted. Your entries are
            not changed.
          </p>
          <label className="flex items-center gap-2 text-sm mb-6">
            <input
              type="checkbox"
              checked={ignoreOnDelete}
              onChange={(e) => setIgnoreOnDelete(e.target.checked)}
            />
            Don't suggest this name again
          </label>
          <div className="flex justify-end">
            <button
              onClick={() =>
                act(async () => {
                  await peopleService.remove(person.id, {
                    ignoreName: ignoreOnDelete,
                  });
                  navigate("/people");
                }, "Deleted")
              }
              className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium"
            >
              Delete
            </button>
          </div>
        </Modal>
      </main>
    </div>
  );
}
