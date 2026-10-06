// Ordered schema migrations, kept deliberately free of imports.
//
// This module must stay pure: no better-sqlite3, no electron, no node
// builtins. connection.js opens the database as a module-level side effect,
// so importing it under vitest would open the developer's real journal.
// Keeping the runner here instead means it can be unit tested against a fake
// database object.
//
// Migrations 1 to 3 are the schema as it stood before versioning existed, and
// every statement in them is idempotent. That is what makes the backfill
// trivial: any pre-versioning database reads user_version 0, runs all three,
// and they no-op against an already-current schema. It is exactly what
// happened on every launch before this file existed. From version 4 onward
// user_version is maintained, so new migrations may be destructive and must
// never be edited once shipped.

const BASELINE_DDL = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            timezone TEXT,
            profile_picture TEXT, -- <-- ADDED column for profile image path
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            dark_mode INTEGER DEFAULT 0,
            font_size TEXT DEFAULT 'medium',
            auto_save_interval INTEGER DEFAULT 60,
            speech_language TEXT DEFAULT 'en',
            biometric_lock INTEGER DEFAULT 0,
            send_to_ai INTEGER DEFAULT 1,
            journal_reminder INTEGER DEFAULT 1,
            challenge_alert INTEGER DEFAULT 1,
            check_in_frequency TEXT DEFAULT 'daily',
            ai_tone TEXT DEFAULT 'neutral',
            breathing_reminder INTEGER DEFAULT 0,
            daily_challenge_type TEXT DEFAULT 'default',
            auto_summarize INTEGER DEFAULT 1,
            ai_tags INTEGER DEFAULT 1,
            insight_tone TEXT DEFAULT 'supportive',
            enable_ai_image INTEGER DEFAULT 0,
            enable_voice_mood INTEGER DEFAULT 0,
            enable_smart_prompts INTEGER DEFAULT 1,
            auto_save_timer INTEGER DEFAULT 30,
            journal_streaks INTEGER DEFAULT 1,
            weekly_summary_email INTEGER DEFAULT 1,
            journaling_goal INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            custom_colors TEXT,
            selected_theme TEXT DEFAULT 'Default',
            use_custom_colors INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT,
            content TEXT NOT NULL,
            mood_score INTEGER,
            sentiment_score REAL,
            transcription TEXT,
            image_key TEXT,
            audio_key TEXT,
            content_summary TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            synced_to_qdrant TEXT DEFAULT 'not_synced' CHECK(synced_to_qdrant IN ('not_synced', 'pending', 'in_progress', 'success', 'failed')),
            qdrant_id TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync columns can be added here if tags need to be synced
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, name) -- Ensures a user can't have duplicate tags
        );

        -- The junction table to link journal entries and tags
        CREATE TABLE IF NOT EXISTS journal_entry_tags (
            journal_entry_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (journal_entry_id, tag_id), -- Prevents duplicate tags on the same entry
            FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            body TEXT,
            read INTEGER DEFAULT 0,
            type TEXT DEFAULT 'insight',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- This table is typically managed by the online backend and may not need sync columns
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT,
            is_revoked INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- AI-generated tables are likely read-only offline, but we add sync columns
        -- in case the user can interact with them (e.g., dismiss a nudge).

        CREATE TABLE IF NOT EXISTS journal_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            summary_type TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            average_mood_score REAL,
            average_sentiment_score REAL,
            dominant_mood_tags TEXT,
            insights TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, summary_type, period_start)
        );

        CREATE TABLE IF NOT EXISTS ai_insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            pattern_type TEXT NOT NULL,
            pattern_description TEXT NOT NULL,
            recurring_day TEXT,
            detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            source_journal_ids TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ai_interventions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            insight_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            recommended_at TEXT DEFAULT CURRENT_TIMESTAMP,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'suggested',
            completed_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (insight_id) REFERENCES ai_insights(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS ai_nudges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT,
            message TEXT NOT NULL,
            nudge_type TEXT,
            related_insight_id INTEGER,
            read INTEGER DEFAULT 0,
            action_taken INTEGER DEFAULT 0,
            action_description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (related_insight_id) REFERENCES ai_insights(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS user_emotion_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            day_of_week TEXT NOT NULL,
            emotion TEXT NOT NULL,
            frequency INTEGER DEFAULT 1,
            last_detected TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS journal_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_id INTEGER NOT NULL UNIQUE,
            sentiment TEXT,
            mood TEXT,
            topics TEXT,
            recurring_thoughts TEXT,
            cognitive_distortions TEXT,
            suggested_therapy_technique TEXT,
            analyzed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE CASCADE
        );
        -- Categories Table
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, name)
        );

        -- Goals Table
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            parent_goal_title TEXT,
            current_value REAL NOT NULL DEFAULT 0,
            target_value REAL NOT NULL,
            unit TEXT NOT NULL,
            is_pinned INTEGER NOT NULL DEFAULT 0, -- Using 0 for FALSE
            is_completed INTEGER NOT NULL DEFAULT 0, -- Using 0 for FALSE
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_date TEXT, -- 'YYYY-MM-DD'
            target_date TEXT, -- 'YYYY-MM-DD'
            synced_to_qdrant TEXT DEFAULT 'not_synced' CHECK(synced_to_qdrant IN ('not_synced', 'pending', 'in_progress', 'success', 'failed')),
            qdrant_id TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );

        -- Progress Logs Table
        CREATE TABLE IF NOT EXISTS progress_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            value REAL NOT NULL,
            description TEXT,
            synced_to_qdrant TEXT DEFAULT 'not_synced' CHECK(synced_to_qdrant IN ('not_synced', 'pending', 'in_progress', 'success', 'failed')),
            qdrant_id TEXT,
            logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
        );

        -- =============================================== --
        -- ==          NEWLY ADDED CHAT TABLES          == --
        -- =============================================== --

        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            model TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            sender TEXT NOT NULL CHECK(sender IN ('user', 'ai')),
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            file_type TEXT,
            file_path TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS message_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_title TEXT,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        );

        -- Add indexes for faster lookups
        CREATE INDEX IF NOT EXISTS idx_goals_synced_to_qdrant ON goals(synced_to_qdrant);
        CREATE INDEX IF NOT EXISTS idx_progress_logs_synced_to_qdrant ON progress_logs(synced_to_qdrant);

        CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
        CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
        CREATE INDEX IF NOT EXISTS idx_progress_logs_goal_id ON progress_logs(goal_id);
    
        -- NEW INDEXES FOR TAGS
        CREATE INDEX IF NOT EXISTS idx_tags_user_id_name ON tags(user_id, name);
        CREATE INDEX IF NOT EXISTS idx_jet_tag_id ON journal_entry_tags(tag_id);

        -- INDEXES FOR NEW CHAT TABLES
        CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
        CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
        CREATE INDEX IF NOT EXISTS idx_files_message_id ON files(message_id);
        CREATE INDEX IF NOT EXISTS idx_message_sources_message_id ON message_sources(message_id);

`;

/** Adds columns that were bolted on after the baseline shipped. */
function addLateColumns(d) {
  const userCols = d
    .prepare(`PRAGMA table_info(users)`)
    .all()
    .map((c) => c.name);
  if (!userCols.includes("profile_picture")) {
    d.prepare(`ALTER TABLE users ADD COLUMN profile_picture TEXT`).run();
  }

  const journalCols = d
    .prepare(`PRAGMA table_info(journal_entries)`)
    .all()
    .map((c) => c.name);
  if (!journalCols.includes("ai_metadata_status")) {
    d.prepare(
      `ALTER TABLE journal_entries ADD COLUMN ai_metadata_status TEXT DEFAULT 'not_started' CHECK(ai_metadata_status IN ('not_started','pending','completed','failed'))`,
    ).run();
  }
  if (!journalCols.includes("ai_summary_status")) {
    d.prepare(
      `ALTER TABLE journal_entries ADD COLUMN ai_summary_status TEXT DEFAULT 'not_started' CHECK(ai_summary_status IN ('not_started','pending','completed','failed','skipped'))`,
    ).run();
  }
  if (!journalCols.includes("ai_metadata_error")) {
    d.prepare(
      `ALTER TABLE journal_entries ADD COLUMN ai_metadata_error TEXT`,
    ).run();
  }
  if (!journalCols.includes("ai_summary_error")) {
    d.prepare(
      `ALTER TABLE journal_entries ADD COLUMN ai_summary_error TEXT`,
    ).run();
  }
}

export const MIGRATIONS = [
  {
    version: 1,
    name: "baseline-schema",
    up: (d) => d.exec(BASELINE_DDL),
  },
  {
    version: 2,
    name: "late-added-columns",
    up: addLateColumns,
  },
  {
    // The Daily Challenge feature was removed. These tables were never
    // populated locally (offline mode), so drop them to clean up existing
    // installs. Child table first to satisfy the foreign key.
    //
    // This used to run on every single launch, which was a standing
    // instruction to delete two named tables at every boot. As a numbered
    // migration it runs once per install and is then recorded.
    version: 3,
    name: "drop-challenge-tables",
    up: (d) =>
      d.exec(`
        DROP TABLE IF EXISTS user_challenges;
        DROP TABLE IF EXISTS daily_challenges;
      `),
  },
  {
    // Every journal list, dashboard and gallery query filters on user_id and
    // is_deleted and sorts or ranges on created_at; without this index each
    // one scanned the whole table (DB-1, 41 scans per bench run). The
    // journal_entry_tags lookup MASTER_TODO item 7 also asked for is already
    // served by that table's primary key, (journal_entry_id, tag_id).
    version: 4,
    name: "journal-entries-list-index",
    up: (d) =>
      d.exec(`
        CREATE INDEX IF NOT EXISTS idx_journal_entries_user_deleted_created
          ON journal_entries(user_id, is_deleted, created_at);
      `),
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Applies every migration newer than the database's current user_version,
 * each in its own transaction together with the version stamp, so a failure
 * leaves the database at the last version that fully applied.
 *
 * @param {object} d - a better-sqlite3 Database, or anything with the same
 *   pragma/exec/prepare/transaction surface.
 * @param {Array} migrations - defaults to MIGRATIONS; injectable for tests.
 * @param {{ beforeMigrate?: (from: number) => void }} options - beforeMigrate
 *   runs once, outside any transaction, only when there is work to do. It is
 *   where connection.js takes its pre-migration backup.
 * @returns {{ from: number, to: number, applied: string[] }}
 */
export function runMigrations(d, migrations = MIGRATIONS, options = {}) {
  const from = Number(d.pragma("user_version", { simple: true })) || 0;
  const latest = migrations.length
    ? migrations[migrations.length - 1].version
    : 0;
  if (from >= latest) return { from, to: from, applied: [] };

  options.beforeMigrate?.(from);

  const applied = [];
  for (const migration of migrations) {
    if (migration.version <= from) continue;
    d.transaction(() => {
      migration.up(d);
      // PRAGMA takes no bound parameters, hence the interpolation. The value
      // comes from this hardcoded list, never from input.
      d.pragma(`user_version = ${migration.version}`);
    })();
    applied.push(migration.name);
  }

  return { from, to: latest, applied };
}
