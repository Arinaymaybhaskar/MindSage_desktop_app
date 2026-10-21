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
    // journal_entry_tags lookup an earlier audit also asked for is already
    // served by that table's primary key, (journal_entry_id, tag_id).
    version: 4,
    name: "journal-entries-list-index",
    up: (d) =>
      d.exec(`
        CREATE INDEX IF NOT EXISTS idx_journal_entries_user_deleted_created
          ON journal_entries(user_id, is_deleted, created_at);
      `),
  },
  {
    // Trash (KAN-52). Deleting an entry or a goal used to either hide it
    // forever (entries: is_deleted = 1, nothing ever read it back or removed
    // it) or destroy it at once (goals). Both now sit in the trash for 30 days
    // and are then purged, so each row records when it was trashed.
    //
    // Entries already soft-deleted get deleted_at = now, so their 30 days start
    // at the upgrade: they appear in the Trash and can be restored. (Stamping
    // them from their last update would purge the old ones within seconds of
    // the first launch, before anyone could look.)
    //
    // vector_deletions is the durable queue of search-index points to remove
    // after the row is gone, so a purge that happens while the vector store
    // is down is finished later instead of leaving the text behind.
    version: 5,
    name: "trash",
    up: (d) =>
      d.exec(`
        ALTER TABLE journal_entries ADD COLUMN deleted_at TEXT;
        ALTER TABLE goals ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE goals ADD COLUMN deleted_at TEXT;

        UPDATE journal_entries
           SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE is_deleted = 1 AND deleted_at IS NULL;

        CREATE INDEX IF NOT EXISTS idx_goals_user_deleted
          ON goals(user_id, is_deleted);
        CREATE INDEX IF NOT EXISTS idx_journal_entries_trashed
          ON journal_entries(user_id, deleted_at) WHERE is_deleted = 1;

        CREATE TABLE IF NOT EXISTS vector_deletions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          source_type TEXT NOT NULL
            CHECK(source_type IN ('journal', 'goal', 'progress_log')),
          source_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_type, source_id)
        );
      `),
  },
  {
    // Deleting an entry or goal for good looks up the saved answers that cite
    // it by (source_type, source_id); without this index every lookup walks
    // all of the user's messages.
    version: 6,
    name: "message-sources-lookup",
    up: (d) =>
      d.exec(`
      CREATE INDEX IF NOT EXISTS idx_message_sources_source
        ON message_sources(source_type, source_id);
    `),
  },
  {
    // The search index (KAN-192). The vectors live in a sqlite-vec table made
    // at startup (vectorExtension.js, so a machine that cannot load the
    // extension still migrates); this table says what is indexed, what
    // is waiting and what failed, and its id is the vector's rowid.
    //
    // attempts / next_attempt_at are the bounded backfill's memory (KAN-88):
    // a row that fails waits 1 min, 5 min, 30 min, 2 h, then 12 h; after
    // five failed attempts it waits until its content changes.
    version: 7,
    name: "search-index",
    up: (d) =>
      d.exec(`
        CREATE TABLE IF NOT EXISTS search_index (
          id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL,
          source_type TEXT NOT NULL
            CHECK(source_type IN ('journal', 'goal', 'progress_log')),
          source_id INTEGER NOT NULL,
          content_hash TEXT,
          state TEXT NOT NULL DEFAULT 'pending'
            CHECK(state IN ('pending', 'ok', 'failed')),
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER,
          last_error TEXT,
          indexed_at TEXT,
          UNIQUE(source_type, source_id)
        );
        CREATE INDEX IF NOT EXISTS idx_search_index_work
          ON search_index(state, next_attempt_at);
        CREATE INDEX IF NOT EXISTS idx_search_index_user
          ON search_index(user_id);
      `),
  },
  {
    // Qdrant is gone (KAN-192). Its bookkeeping goes with it: the queue of
    // points to delete (a purge now removes vectors in its own transaction)
    // and the per-row sync state, which search_index replaced. The two
    // indexes on that state must be dropped before their columns.
    version: 8,
    name: "drop-qdrant-state",
    up: (d) => {
      d.exec(`
        DROP TABLE IF EXISTS vector_deletions;
        DROP INDEX IF EXISTS idx_goals_synced_to_qdrant;
        DROP INDEX IF EXISTS idx_progress_logs_synced_to_qdrant;
      `);
      for (const table of ["journal_entries", "goals", "progress_logs"]) {
        const columns = d
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((c) => c.name);
        for (const column of ["synced_to_qdrant", "qdrant_id"]) {
          if (columns.includes(column)) {
            d.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
          }
        }
      }
    },
  },
  {
    // The People section (docs/PEOPLE.md). Everything here is derived from
    // journal entries, so every row hangs off an entry or a person by a
    // cascading foreign key: deleting either removes what was worked out from
    // it in the same statement. Mentions keep sentence offsets rather than a
    // copy of the text, so the journal is never stored twice.
    version: 9,
    name: "people-tables",
    up: (d) =>
      d.exec(`
        CREATE TABLE IF NOT EXISTS people (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            display_name TEXT NOT NULL,
            relationship TEXT,
            relationship_suggested TEXT,
            status TEXT NOT NULL DEFAULT 'suggested'
              CHECK(status IN ('suggested', 'confirmed', 'ignored')),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_people_user_status
          ON people(user_id, status);

        CREATE TABLE IF NOT EXISTS person_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER NOT NULL,
            alias TEXT NOT NULL,
            alias_normalised TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'ai' CHECK(source IN ('user', 'ai')),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
            UNIQUE(person_id, alias_normalised)
        );
        CREATE INDEX IF NOT EXISTS idx_person_aliases_normalised
          ON person_aliases(alias_normalised);

        CREATE TABLE IF NOT EXISTS person_mentions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL,
            person_id INTEGER NOT NULL,
            name_as_written TEXT NOT NULL,
            sentence_start INTEGER NOT NULL,
            sentence_end INTEGER NOT NULL,
            valence INTEGER CHECK(valence BETWEEN -2 AND 2),
            feeling_tags TEXT,
            confidence REAL,
            user_verified INTEGER NOT NULL DEFAULT 0,
            extractor_version INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_person_mentions_person
          ON person_mentions(person_id);
        CREATE INDEX IF NOT EXISTS idx_person_mentions_entry
          ON person_mentions(entry_id);

        CREATE TABLE IF NOT EXISTS person_summaries (
            person_id INTEGER PRIMARY KEY,
            summary_json TEXT NOT NULL,
            mentions_hash TEXT NOT NULL,
            model TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS people_jobs (
            entry_id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            content_hash TEXT,
            status TEXT NOT NULL DEFAULT 'queued'
              CHECK(status IN ('queued', 'running', 'done', 'skipped', 'failed')),
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            extractor_version INTEGER,
            priority INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_people_jobs_user_status
          ON people_jobs(user_id, status);
      `),
  },
  {
    // Sign-up asks for no email any more (KAN-76), so users.email loses its
    // NOT NULL; UNIQUE stays, and SQLite lets any number of rows be NULL under
    // it. SQLite cannot drop NOT NULL in place, so the table is rebuilt from its
    // own stored DDL (every column any install has, in order), keeping each id
    // and the AUTOINCREMENT counter so a deleted profile's id is never reused.
    // rebuildsTables makes the runner turn foreign keys off around it, or the
    // DROP would cascade into every journal.
    version: 10,
    name: "users-email-optional",
    rebuildsTables: true,
    up: (d) => {
      const { sql } = d
        .prepare(`SELECT sql FROM sqlite_master WHERE name = 'users'`)
        .get();
      const email = /\bemail\s+TEXT\s+NOT\s+NULL\s+UNIQUE\b/i;
      if (!email.test(sql)) throw new Error("users.email has an unknown shape");
      const ddl = sql
        .replace(email, "email TEXT UNIQUE")
        .replace(/^CREATE TABLE\s+"?users"?/i, "CREATE TABLE users_new");
      const seq = () =>
        d
          .prepare(`SELECT max(seq) AS seq FROM sqlite_sequence WHERE name = ?`)
          .get("users")?.seq ?? null;
      const before = seq();
      d.exec(ddl);
      d.exec(`
        INSERT INTO users_new SELECT * FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
      const after = seq();
      if (before != null && (after == null || after < before)) {
        d.prepare(`DELETE FROM sqlite_sequence WHERE name = 'users'`).run();
        d.prepare(
          `INSERT INTO sqlite_sequence (name, seq) VALUES ('users', ?)`,
        ).run(before);
      }
    },
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
    // A table rebuild needs foreign keys off, or dropping the old table
    // cascades into its children, and the pragma is a no-op inside a
    // transaction (sqlite.org/lang_altertable.html, "other kinds of changes").
    const fkOff =
      migration.rebuildsTables && d.pragma("foreign_keys", { simple: true });
    if (fkOff) d.pragma("foreign_keys = OFF");
    try {
      d.transaction(() => {
        migration.up(d);
        if (migration.rebuildsTables && d.pragma("foreign_key_check").length) {
          throw new Error(`${migration.name} left a broken foreign key`);
        }
        // PRAGMA takes no bound parameters, hence the interpolation. The value
        // comes from this hardcoded list, never from input.
        d.pragma(`user_version = ${migration.version}`);
      })();
    } finally {
      if (fkOff) d.pragma("foreign_keys = ON");
    }
    applied.push(migration.name);
  }

  return { from, to: latest, applied };
}
