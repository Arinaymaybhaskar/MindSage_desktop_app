/**
 * Shapes returned by the `people:*` handlers in electron/methods/people.js.
 * The tables behind them are migration 9 in electron/db/migrations.js.
 */

export type PersonStatus = "suggested" | "confirmed" | "ignored";

export const RELATIONSHIPS = [
  "mother",
  "father",
  "parent",
  "brother",
  "sister",
  "sibling",
  "grandparent",
  "partner",
  "child",
  "relative",
  "friend",
  "manager",
  "colleague",
  "teacher",
  "classmate",
  "roommate",
  "neighbour",
  "therapist",
  "other",
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];

export interface TrendPoint {
  entryId: number;
  date: string;
  /** Rolling average of how the writer felt, -2 to 2. */
  value: number;
}

export interface PersonCard {
  id: number;
  displayName: string;
  relationship: Relationship | null;
  relationshipSuggested: Relationship | null;
  status: PersonStatus;
  aliases: string[];
  mentionCount: number;
  lastMentionedAt: string | null;
  /** Empty until there are at least three entries with a feeling. */
  trend: TrendPoint[];
}

export interface PersonMention {
  id: number;
  quote: string;
  nameAsWritten: string;
  valence: number | null;
  feelings: string[];
  userVerified: boolean;
}

export interface PersonEntry {
  entryId: number;
  title: string | null;
  createdAt: string;
  mentions: PersonMention[];
}

export interface SummaryLine {
  text: string;
  entryIds: number[];
}

export interface PersonSummary {
  lines: SummaryLine[];
  stale: boolean;
  createdAt?: string;
}

export interface PersonDetail extends PersonCard {
  entries: PersonEntry[];
  mentionsByMonth: { month: string; count: number }[];
  summary: PersonSummary | null;
}

export interface InboxSuggestion extends PersonCard {
  sampleQuote: string;
}

export interface PeopleInbox {
  suggestions: InboxSuggestion[];
  sameAs: { suggested: InboxSuggestion; confirmed: PersonCard }[];
}

export interface PeopleJobCounts {
  queued: number;
  running: number;
  done: number;
  skipped: number;
  failed: number;
  /** Live journal entries, processed or not. */
  total: number;
}

export interface PeopleStatus {
  enabled: boolean;
  paused: boolean;
  onBattery: boolean;
  counts: PeopleJobCounts | null;
  inboxCount: number;
}

export interface EntryMention {
  id: number;
  personId: number;
  displayName: string;
  status: PersonStatus;
  relationship: Relationship | null;
  nameAsWritten: string;
  /** Character offsets of the sentences in the entry's content. */
  start: number;
  end: number;
  valence: number | null;
  feelings: string[];
  userVerified: boolean;
}

export interface EntryMentions {
  enabled: boolean;
  mentions: EntryMention[];
  people?: { id: number; displayName: string }[];
  feelings?: string[];
}

export type MentionFix =
  | { action: "confirm" }
  | { action: "feeling"; valence: number }
  | { action: "reassign"; personId?: number; newName?: string }
  | { action: "not-person" };
