// Imported entries skip the per-entry AI pipeline (KAN-80). Instead the newest
// of them are marked for the one backfill in methods/ollama.js, which runs when
// the models are ready, and fills in only what the source left blank.
import { isSummarizable } from "./AIPrompts.js";

// shortcut: only the newest 200 imported entries get AI details; older ones
// keep their Generate button. Raise it once a backfill is measured cheap.
export const BACKFILL_LIMIT = 200;

export const WAITING = "Imported: filled in once the local AI is ready";

/**
 * The AI status columns for each imported entry, in the same order, or null
 * to leave the row as created ('not_started').
 */
export function importStatuses(entries, limit = BACKFILL_LIMIT) {
  const newest = new Set(
    [...entries]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit),
  );
  return entries.map((e) => {
    if (!newest.has(e)) return null;
    const needsMetadata = !e.title?.trim() || e.mood == null || !e.tags?.length;
    const summarize = isSummarizable(e.content);
    return {
      ai_metadata_status: needsMetadata ? "failed" : "completed",
      ai_metadata_error: needsMetadata ? WAITING : null,
      ai_summary_status: summarize ? "failed" : "skipped",
      ai_summary_error: summarize ? WAITING : null,
    };
  });
}
