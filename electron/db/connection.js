import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// Define the path for the database in the user's app data folder
const dbPath = path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"), 'MindSage', 'mind-sage.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Create and export the database instance
export const db = new Database(dbPath);


export function initDatabase() {
    db.exec(`
        PRAGMA foreign_keys = ON;

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

        -- This table is likely read-only from the server, but we add sync columns for completeness
        CREATE TABLE IF NOT EXISTS daily_challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            challenge_date TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            challenge_id INTEGER,
            accepted INTEGER DEFAULT 0,
            completed INTEGER DEFAULT 0,
            image_key TEXT,
            accepted_at TEXT DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (challenge_id) REFERENCES daily_challenges(id) ON DELETE CASCADE
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
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );

        -- Progress Logs Table
        CREATE TABLE IF NOT EXISTS progress_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            value REAL NOT NULL,
            description TEXT,
            logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
        );

        -- Add indexes for faster lookups
        CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
        CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
        CREATE INDEX IF NOT EXISTS idx_progress_logs_goal_id ON progress_logs(goal_id);
    
        -- NEW INDEXES FOR TAGS
        CREATE INDEX IF NOT EXISTS idx_tags_user_id_name ON tags(user_id, name);
        CREATE INDEX IF NOT EXISTS idx_jet_tag_id ON journal_entry_tags(tag_id);

        `);

    // Ensure older DBs get the new column if missing
    try {
        const info = db.prepare(`PRAGMA table_info(users)`).all();
        const hasProfileCol = info.some(col => col.name === 'profile_picture');
        if (!hasProfileCol) {
            db.prepare(`ALTER TABLE users ADD COLUMN profile_picture TEXT`).run();
            console.log("Added users.profile_picture column via ALTER TABLE");
        }
    } catch (err) {
        console.error("Error ensuring profile_picture column exists:", err);
    }

    // Insert a system user if it doesn't exist
    const insertSystemUser = db.prepare(`
        INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name)
        VALUES (0, 'System', 'system@mindsage.app', 'N/A', 'System User')
    `);
    insertSystemUser.run();

    // Seed global categories for the system user
    const categories = [
        { name: 'Health', color: '#FF6B6B' },
        { name: 'Work', color: '#4ECDC4' },
        { name: 'Finance', color: '#FFD93D' },
        { name: 'Personal Growth', color: '#6A4C93' },
        { name: 'Leisure', color: '#1A535C' }
    ];

    const insertCategory = db.prepare(`
        INSERT OR IGNORE INTO categories (user_id, name, color)
        VALUES (0, ?, ?)
    `);

    for (const cat of categories) {
        insertCategory.run(cat.name, cat.color);
    }

    console.log('Local database with normalized tags initialized successfully.');
}