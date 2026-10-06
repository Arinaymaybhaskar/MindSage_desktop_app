/**
 * Shapes returned by the `user:*` IPC channels, mirroring the `users` and
 * `user_settings` tables in `electron/db/connection.js`.
 *
 * SQLite has no boolean type, so the flags below are stored as INTEGER 0/1.
 * The `user:get-settings` handler hands them back as numbers; treat them as
 * truthy/falsy rather than comparing against `true`.
 */
import type { SqliteBoolean } from "./sqlite";

export type { SqliteBoolean };

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  full_name?: string | null;
  timezone?: string | null;
  profile_picture?: string | null;
  created_at?: string;
  entriesCount?: number;
  lastEntryDate?: string | null;
}

export interface UserSettings {
  user_id: number;
  dark_mode?: SqliteBoolean;
  font_size?: string;
  auto_save_interval: number;
  speech_language: string;
  biometric_lock: SqliteBoolean;
  send_to_ai: SqliteBoolean;
  journal_reminder: SqliteBoolean;
  challenge_alert?: SqliteBoolean;
  check_in_frequency: string;
  ai_tone: string;
  breathing_reminder: SqliteBoolean;
  daily_challenge_type?: string;
  auto_summarize: SqliteBoolean;
  ai_tags: SqliteBoolean;
  insight_tone: string;
  enable_ai_image: SqliteBoolean;
  enable_voice_mood: SqliteBoolean;
  enable_smart_prompts: SqliteBoolean;
  auto_save_timer: number;
  journal_streaks: SqliteBoolean;
  weekly_summary_email: SqliteBoolean;
  journaling_goal: number;
  created_at?: string;
  updated_at?: string;
  /** Per-task Ollama model choices, as chosen in the Models panel. */
  models?: Record<string, string>;
  custom_colors?: string;
  selected_theme?: string;
  use_custom_colors?: SqliteBoolean;
}

/** Payload accepted by the `user:update-profile` channel. */
export interface ProfileUpdate {
  username: string;
  email: string;
  full_name?: string;
  profile_picture?: string | null;
}

/**
 * Every panel rendered by `src/pages/settings.tsx` is handed the same four
 * props. Individual panels narrow this with `Pick<>` to just what they read.
 */
export interface SettingsPanelProps {
  user: UserInfo | null;
  settings: UserSettings | null;
  onProfileSave: (profile: ProfileUpdate) => void | Promise<void>;
  onSettingsSave: (settings: UserSettings) => void | Promise<void>;
}
