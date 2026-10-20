import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { peopleService } from "../../api/peopleService";
import type {
  EntryMention,
  EntryMentions,
  MentionFix,
} from "../../types/People";
import Modal from "../Modal";
import { useToast } from "../../hooks/useToast";
import { relationshipLabel, VALENCE_OPTIONS, valenceLabel } from "./labels";

interface Props {
  entryId: number;
  content: string;
}

interface Mark {
  start: number;
  end: number;
  mention: EntryMention;
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * Where to underline: each occurrence of the name as written inside the
 * sentences the mention points at. Mentions keep offsets, not text, so the
 * quote always comes from the entry itself.
 */
function marksFor(content: string, mentions: EntryMention[]): Mark[] {
  const lower = content.toLowerCase();
  const marks: Mark[] = [];
  for (const m of mentions) {
    const needle = m.nameAsWritten.toLowerCase();
    if (!needle) continue;
    let from = Math.max(0, m.start);
    const until = Math.min(content.length, m.end);
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1 || at + needle.length > until) break;
      if (
        !isWordChar(lower[at - 1]) &&
        !isWordChar(lower[at + needle.length])
      ) {
        marks.push({ start: at, end: at + needle.length, mention: m });
      }
      from = at + needle.length;
    }
  }
  marks.sort((a, b) => a.start - b.start);
  // Drop overlaps, keeping the earlier mark.
  return marks.filter((mk, i) => i === 0 || mk.start >= marks[i - 1].end);
}

/**
 * An entry's text with the people the AI found underlined. Tapping a name
 * opens the person, or fixes the guess: wrong person, not a person, or the
 * wrong feeling. Plain text, unchanged, when People is off.
 */
export default function EntryContentWithPeople({ entryId, content }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [data, setData] = useState<EntryMentions | null>(null);
  const [selected, setSelected] = useState<EntryMention | null>(null);
  const [reassign, setReassign] = useState<string>("");
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await peopleService.entryMentions(entryId));
    } catch {
      // People is optional; the entry still reads fine without it.
      setData(null);
    }
  }, [entryId]);

  useEffect(() => {
    load();
    const unsubscribe = peopleService.onChanged(() => load());
    return () => unsubscribe();
  }, [load]);

  const fix = async (f: MentionFix, message: string) => {
    if (!selected) return;
    try {
      await peopleService.fixMention(selected.id, f);
      showToast(message, "success");
      setSelected(null);
      setReassign("");
      setNewName("");
      load();
    } catch (err) {
      showToast((err as Error).message || "Could not save that", "danger");
    }
  };

  if (!data?.enabled || !data.mentions.length) return <>{content}</>;

  const marks = marksFor(content, data.mentions);
  const parts: ReactNode[] = [];
  let at = 0;
  marks.forEach((mk, i) => {
    if (mk.start > at) parts.push(content.slice(at, mk.start));
    parts.push(
      <button
        key={i}
        type="button"
        onClick={() => setSelected(mk.mention)}
        className={`inline underline decoration-2 underline-offset-4 cursor-pointer hover:opacity-80 ${
          mk.mention.status === "confirmed"
            ? "decoration-light1 dark:decoration-dark1"
            : "decoration-dotted decoration-text-light-sub dark:decoration-text-dark-sub"
        }`}
        title={
          mk.mention.status === "confirmed"
            ? mk.mention.displayName
            : `${mk.mention.displayName} (suggested)`
        }
      >
        {content.slice(mk.start, mk.end)}
      </button>,
    );
    at = mk.end;
  });
  if (at < content.length) parts.push(content.slice(at));

  const others = (data.people ?? []).filter((p) => p.id !== selected?.personId);

  return (
    <>
      {parts}
      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.displayName ?? ""}
        size="md"
      >
        {selected && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-text-light-sub dark:text-text-dark-sub">
                {selected.status === "confirmed"
                  ? relationshipLabel(selected.relationship) || "In your People"
                  : "Suggested. Review it in People → Someone new?"}
              </span>
              {selected.status === "confirmed" && (
                <button
                  onClick={() => navigate(`/people/${selected.personId}`)}
                  className="px-3 py-1.5 rounded-lg bg-light1 dark:bg-dark1 text-white font-medium"
                >
                  Open {selected.displayName}
                </button>
              )}
            </div>

            <div>
              <p className="font-medium mb-2">
                How you felt about {selected.displayName} here
                {selected.userVerified ? " (set by you)" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {VALENCE_OPTIONS.map((v) => (
                  <button
                    key={v}
                    onClick={() =>
                      fix({ action: "feeling", valence: v }, "Feeling updated")
                    }
                    className={`px-3 py-1.5 rounded-lg border ${
                      selected.valence === v
                        ? "border-light1 dark:border-dark1 font-semibold"
                        : "border-border-light dark:border-border-dark"
                    }`}
                  >
                    {valenceLabel(v)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="font-medium mb-2">Wrong person?</p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={reassign}
                  onChange={(e) => setReassign(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark"
                >
                  <option value="">Choose who it is</option>
                  {others.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                  <option value="new">Someone new…</option>
                </select>
                {reassign === "new" && (
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Their name"
                    className="px-2 py-1.5 rounded-lg bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark"
                  />
                )}
                <button
                  disabled={
                    !reassign || (reassign === "new" && !newName.trim())
                  }
                  onClick={() =>
                    fix(
                      reassign === "new"
                        ? { action: "reassign", newName }
                        : { action: "reassign", personId: Number(reassign) },
                      "Moved",
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-tertiary-light dark:bg-tertiary-dark disabled:opacity-50"
                >
                  Move
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-border-light dark:border-border-dark">
              <button
                onClick={() =>
                  fix(
                    { action: "not-person" },
                    `“${selected.nameAsWritten}” won't be suggested again`,
                  )
                }
                className="px-3 py-1.5 rounded-lg text-danger hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
              >
                Not a person
              </button>
              {!selected.userVerified && (
                <button
                  onClick={() => fix({ action: "confirm" }, "Thanks")}
                  className="px-3 py-1.5 rounded-lg bg-tertiary-light dark:bg-tertiary-dark"
                >
                  Looks right
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
