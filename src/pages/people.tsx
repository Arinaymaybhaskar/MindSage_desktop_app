import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pause, Play, Power, RotateCcw, Users } from "lucide-react";
import { peopleService } from "../api/peopleService";
import type {
  PeopleInbox as Inbox,
  PeopleStatus,
  PersonCard,
} from "../types/People";
import PeopleOptIn from "../components/people/PeopleOptIn";
import PeopleInbox from "../components/people/PeopleInbox";
import FeelingSparkline from "../components/people/FeelingSparkline";
import { relationshipLabel } from "../components/people/labels";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { useToast } from "../hooks/useToast";

type Tab = "people" | "inbox";

function ProgressLine({
  status,
  onTogglePause,
  onRetry,
}: {
  status: PeopleStatus;
  onTogglePause: () => void;
  onRetry: () => void;
}) {
  const c = status.counts;
  if (!c) return null;
  const processed = c.done + c.skipped + c.failed;
  const waiting = c.queued + c.running;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-text-light-sub dark:text-text-dark-sub">
      {waiting > 0 ? (
        <span>
          Reading your entries: {Math.min(processed, c.total)} of {c.total}
          {status.paused
            ? " (paused)"
            : status.onBattery
              ? " (older entries wait for mains power)"
              : ""}
        </span>
      ) : (
        <span>All {c.total} entries read.</span>
      )}
      {waiting > 0 && (
        <button
          onClick={onTogglePause}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
        >
          {status.paused ? <Play size={14} /> : <Pause size={14} />}
          {status.paused ? "Resume" : "Pause"}
        </button>
      )}
      {c.failed > 0 && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
        >
          <RotateCcw size={14} /> Retry {c.failed} that failed
        </button>
      )}
    </div>
  );
}

export default function PeoplePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [status, setStatus] = useState<PeopleStatus | null>(null);
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [inbox, setInbox] = useState<Inbox>({ suggestions: [], sameAs: [] });
  const [tab, setTab] = useState<Tab>("people");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await peopleService.getStatus();
      setStatus(s);
      if (!s.enabled) return;
      const [list, box] = await Promise.all([
        peopleService.list(),
        peopleService.getInbox(),
      ]);
      setPeople(list);
      setInbox(box);
    } catch (err) {
      console.error("Could not load People:", err);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = peopleService.onChanged(() => load());
    return () => unsubscribe();
  }, [load]);

  const enable = async () => {
    setBusy(true);
    try {
      setStatus(await peopleService.setEnabled(true));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (deleteData: boolean) => {
    setConfirmOff(false);
    setStatus(await peopleService.setEnabled(false, { deleteData }));
    setPeople([]);
    setInbox({ suggestions: [], sameAs: [] });
    showToast(
      deleteData
        ? "People turned off and its data deleted"
        : "People turned off",
      "info",
    );
  };

  const inboxCount = inbox.suggestions.length + inbox.sameAs.length;

  return (
    <div className="bg-base-light dark:bg-base-dark text-text-light dark:text-text-dark overflow-y-auto h-full">
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
        <header className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            People
          </h1>
          {status?.enabled && (
            <button
              onClick={() => setConfirmOff(true)}
              className="flex items-center gap-2 self-start px-3 py-1.5 rounded-lg text-sm text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
            >
              <Power size={14} /> Turn off
            </button>
          )}
        </header>

        {status && !status.enabled && (
          <PeopleOptIn onEnable={enable} busy={busy} />
        )}

        {status?.enabled && (
          <>
            <ProgressLine
              status={status}
              onTogglePause={async () =>
                setStatus(await peopleService.setPaused(!status.paused))
              }
              onRetry={async () => {
                await peopleService.retryFailed();
                load();
              }}
            />

            <div
              role="tablist"
              className="mt-6 mb-6 flex gap-2 border-b border-border-light dark:border-border-dark"
            >
              {(
                [
                  ["people", "People"],
                  ["inbox", "Someone new?"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-2 -mb-px border-b-2 font-medium transition-colors ${
                    tab === key
                      ? "border-light1 dark:border-dark1"
                      : "border-transparent text-text-light-sub dark:text-text-dark-sub"
                  }`}
                >
                  {label}
                  {key === "inbox" && inboxCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-light1 dark:bg-dark1 text-white">
                      {inboxCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === "inbox" && <PeopleInbox inbox={inbox} onChanged={load} />}

            {tab === "people" &&
              (people.length === 0 ? (
                <EmptyState
                  Icon={Users}
                  title="No one here yet"
                  message={
                    inboxCount > 0
                      ? "There are suggestions waiting in Someone new?"
                      : "As you write about people, suggestions appear in Someone new? for you to add."
                  }
                />
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {people.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => navigate(`/people/${p.id}`)}
                        className="w-full text-left p-5 rounded-2xl bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-lg font-semibold truncate">
                              {p.displayName}
                            </p>
                            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
                              {[
                                relationshipLabel(p.relationship),
                                `${p.mentionCount} ${p.mentionCount === 1 ? "entry" : "entries"}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <FeelingSparkline points={p.trend} width={90} />
                        </div>
                        {p.lastMentionedAt && (
                          <p className="mt-3 text-xs text-text-light-sub dark:text-text-dark-sub">
                            Last mentioned{" "}
                            {new Date(p.lastMentionedAt).toLocaleDateString()}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </>
        )}

        <Modal
          isOpen={confirmOff}
          onClose={() => setConfirmOff(false)}
          title="Turn off People?"
          size="sm"
        >
          <p className="text-sm text-text-light-sub dark:text-text-dark-sub mb-6">
            Your entries are not touched either way. You can keep what People
            has worked out for if you turn it back on, or delete all of it now.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => turnOff(false)}
              className="px-4 py-2 rounded-lg bg-tertiary-light dark:bg-tertiary-dark text-sm"
            >
              Turn off, keep data
            </button>
            <button
              onClick={() => turnOff(true)}
              className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium"
            >
              Turn off and delete
            </button>
          </div>
        </Modal>
      </main>
    </div>
  );
}
