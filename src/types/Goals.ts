export interface ProgressLog {
  id: number;
  goal_id: string;
  value: number;
  logged_at: string;
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
  is_pinned: boolean;
  is_completed: boolean;
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
