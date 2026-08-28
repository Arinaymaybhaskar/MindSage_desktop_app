/** Shapes returned by the `dashboard:*` channels in `electron/methods/dashboard.js`. */
import type { JournalEntry } from "../api/journalService";
import type { Goal } from "./Goals";

/** One row of `journal:get-images`: a path, not image data. */
export interface JournalImageEntry {
  id: number;
  title: string;
  image_key: string;
  created_at?: string;
}

/** Mean mood for a single calendar day. */
export interface DailyScore {
  day: string;
  avgMood: number;
}

export interface DashboardData {
  userStats: { entryCount: number; lastEntry: string | null };
  dailyScores: DailyScore[];
  recentJournals: JournalEntry[];
  resolvedImages: string[];
  pinnedGoals: Goal[];
}

export interface DashboardStats {
  totalEntries: number;
  totalWords: number;
  firstEntry: string | null;
  lastEntry: string | null;
  longestStreak: number;
  averageMood: number;
  totalGoals: number;
  completedGoals: number;
  activeGoals: number;
  mostUsedTag: string;
  averageEntriesPerDayOfWeek?: { day: string; average: number }[];
}
