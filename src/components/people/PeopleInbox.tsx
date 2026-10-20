import { useState } from "react";
import { Check, GitMerge, X } from "lucide-react";
import type { PeopleInbox as Inbox, Relationship } from "../../types/People";
import { RELATIONSHIPS } from "../../types/People";
import { peopleService } from "../../api/peopleService";
import { useToast } from "../../hooks/useToast";
import { relationshipLabel } from "./labels";

interface PeopleInboxProps {
  inbox: Inbox;
  onChanged: () => void;
}

/**
 * "Someone new?": AI suggestions waiting for a yes, and "is this the same
 * person?" questions. Nothing joins the People list without one of these.
 */
export default function PeopleInbox({ inbox, onChanged }: PeopleInboxProps) {
  const { showToast } = useToast();
  const [relationships, setRelationships] = useState<
    Record<number, Relationship | "">
  >({});

  const run = async (action: () => Promise<unknown>, message?: string) => {
    try {
      await action();
      if (message) showToast(message, "success");
      onChanged();
    } catch (err) {
      showToast((err as Error).message || "Something went wrong", "danger");
    }
  };

  if (!inbox.suggestions.length && !inbox.sameAs.length) {
    return (
      <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
        Nothing waiting. New people show up here once you've written about them
        in two entries.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {inbox.sameAs.map(({ suggested, confirmed }) => (
        <div
          key={`same-${suggested.id}`}
          className="p-4 rounded-xl bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark"
        >
          <p className="font-medium">
            Is {suggested.displayName} the same as {confirmed.displayName}?
          </p>
          {suggested.sampleQuote && (
            <p className="mt-1 text-sm italic text-text-light-sub dark:text-text-dark-sub line-clamp-2">
              “{suggested.sampleQuote}”
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() =>
                run(
                  () => peopleService.merge(confirmed.id, suggested.id),
                  `Added to ${confirmed.displayName}`,
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-light1 dark:bg-dark1 text-white text-sm font-medium"
            >
              <GitMerge size={14} /> Same person
            </button>
            <button
              onClick={() =>
                run(() => peopleService.confirm(suggested.id), "Added")
              }
              className="px-3 py-1.5 rounded-lg bg-tertiary-light dark:bg-tertiary-dark text-sm"
            >
              Someone else, add them
            </button>
            <button
              onClick={() => run(() => peopleService.ignore(suggested.id))}
              className="px-3 py-1.5 rounded-lg text-sm text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
            >
              Ignore
            </button>
          </div>
        </div>
      ))}

      {inbox.suggestions.map((s) => (
        <div
          key={s.id}
          className="p-4 rounded-xl bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark"
        >
          <p className="font-medium">
            {s.displayName}
            <span className="font-normal text-text-light-sub dark:text-text-dark-sub">
              , mentioned in {s.mentionCount} entries
            </span>
          </p>
          {s.sampleQuote && (
            <p className="mt-1 text-sm italic text-text-light-sub dark:text-text-dark-sub line-clamp-2">
              “{s.sampleQuote}”
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label={`Relationship to ${s.displayName}`}
              value={relationships[s.id] ?? s.relationshipSuggested ?? ""}
              onChange={(e) =>
                setRelationships((r) => ({
                  ...r,
                  [s.id]: e.target.value as Relationship | "",
                }))
              }
              className="px-2 py-1.5 rounded-lg text-sm bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark"
            >
              <option value="">Relationship (optional)</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {relationshipLabel(r)}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const rel = relationships[s.id] ?? s.relationshipSuggested;
                run(
                  () =>
                    peopleService.confirm(s.id, { relationship: rel || null }),
                  `${s.displayName} added`,
                );
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-light1 dark:bg-dark1 text-white text-sm font-medium"
            >
              <Check size={14} /> Add
            </button>
            <button
              onClick={() => run(() => peopleService.ignore(s.id))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
            >
              <X size={14} /> Not someone to track
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
