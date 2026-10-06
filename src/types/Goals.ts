import type { SqliteBoolean } from "./sqlite";

export type { SqliteRunResult } from "./sqlite";

export interface ProgressLog {
  id: number;
  goal_id: number;
  value: number;
  description?: string;
  logged_at: string;
  synced_to_qdrant?: string;
  qdrant_id?: string | null;
}

export interface Goal {
  id: number;
  user_id: number;
  category_id?: number;
  title: string;
  description?: string;
  parent_goal_title: string;
  current_value: number;
  target_value: number;
  unit: string;
  is_pinned: SqliteBoolean;
  is_completed: SqliteBoolean;
  created_at: string;
  completed_date: string | null;
  target_date: string;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  color: string;
}

export interface AIGoalSuggestion {
  title: string;
  category: string;
  targetValue: number;
  unit: string;
}

/** `goal:get-by-id` returns the goal joined with its category and logs. */
export interface GoalDetail extends Goal {
  category?: Category;
  logs?: ProgressLog[];
}
