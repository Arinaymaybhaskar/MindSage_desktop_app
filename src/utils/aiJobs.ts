// Which AI job each main-process event belongs to (shared by the Local AI panel and the status card).

export type JobKind = "metadata" | "summary" | "index";
export type JobState = "running" | "done" | "failed" | "skipped";

/** Which job each main-process event belongs to, and what it does to it. */
export const JOB_EVENTS: Record<string, { job: JobKind; state: JobState }> = {
  "journal:aiStarted": { job: "metadata", state: "running" },
  "journal:aiCompleted": { job: "metadata", state: "done" },
  "journal:aiFailed": { job: "metadata", state: "failed" },
  "ollama:summary-started": { job: "summary", state: "running" },
  "ollama:summary-generated": { job: "summary", state: "done" },
  "ollama:summary-failed": { job: "summary", state: "failed" },
  "ollama:summary-skipped": { job: "summary", state: "skipped" },
  "journal:indexStarted": { job: "index", state: "running" },
  "journal:indexCompleted": { job: "index", state: "done" },
  "journal:indexFailed": { job: "index", state: "failed" },
};

export const JOB_LABEL: Record<JobKind, string> = {
  metadata: "Title & mood",
  summary: "Summary",
  index: "Search index",
};
