import dayjs from "dayjs";

/**
 * Numbers the dashboard shows that are not stored anywhere.
 *
 * These are derived in the renderer from data the dashboard already fetches,
 * rather than added to `getUserStats`, so no new query or IPC channel is needed
 * for them.
 */

export interface DayScore {
  day: string; // YYYY-MM-DD
  avgMood: number | null;
}

/**
 * Length of the run of consecutive days ending today or yesterday.
 *
 * Yesterday counts as still-alive: a streak should not appear broken at 00:01
 * simply because today's entry has not been written yet. It breaks on the first
 * missing day before that.
 */
export function currentStreak(scores: DayScore[]): number {
  const written = new Set(scores.filter((s) => s?.day).map((s) => s.day));
  if (written.size === 0) return 0;

  const today = dayjs().startOf("day");
  let cursor = written.has(today.format("YYYY-MM-DD"))
    ? today
    : today.subtract(1, "day");

  if (!written.has(cursor.format("YYYY-MM-DD"))) return 0;

  let streak = 0;
  while (written.has(cursor.format("YYYY-MM-DD"))) {
    streak++;
    cursor = cursor.subtract(1, "day");
  }
  return streak;
}

/** Number of distinct days written in the last `days` days. */
export function daysWrittenIn(scores: DayScore[], days: number): number {
  const cutoff = dayjs().subtract(days - 1, "day").startOf("day");
  return scores.filter((s) => s?.day && !dayjs(s.day).isBefore(cutoff)).length;
}

interface SummaryInput {
  totalEntries: number;
  totalWords: number;
  firstEntry: string | null;
  streak: number;
  daysWritten30: number;
}

/**
 * The line under the greeting.
 *
 * It replaces "Here's a look at your recent activity and memories", which said
 * nothing that a person could not already see. This is assembled from the
 * user's own numbers so the top of the page tells them something true about
 * themselves rather than labelling the furniture.
 */
export function buildSummary({
  totalEntries,
  totalWords,
  firstEntry,
  streak,
  daysWritten30,
}: SummaryInput): string {
  if (totalEntries === 0) {
    return "Nothing here yet. Your first entry is the hardest one; after that it's just a habit.";
  }

  const parts: string[] = [];
  const since = firstEntry ? dayjs(firstEntry) : null;
  // dayjs treats an unparseable date as invalid rather than throwing, so a bad
  // or missing timestamp simply drops the clause instead of breaking the page.
  if (since?.isValid()) {
    parts.push(
      `${totalEntries.toLocaleString()} ${
        totalEntries === 1 ? "entry" : "entries"
      } and ${totalWords.toLocaleString()} words since ${since.format("MMMM YYYY")}`
    );
  } else {
    parts.push(
      `${totalEntries.toLocaleString()} ${
        totalEntries === 1 ? "entry" : "entries"
      } and ${totalWords.toLocaleString()} words so far`
    );
  }

  if (streak > 1) {
    parts.push(`you're ${streak} days into a streak`);
  } else if (daysWritten30 > 0) {
    parts.push(`you've written on ${daysWritten30} of the last 30 days`);
  }

  return `${parts.join(", and ")}.`;
}
