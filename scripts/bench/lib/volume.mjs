/**
 * Builds a synthetic journal of a given size, for measuring how the DB layer
 * scales.
 *
 * Deliberately separate from scripts/seed-demo.mjs. That seeder is tuned for
 * screenshots - a hand-written corpus, ten weeks, photogenic mood curves - and
 * caps out around 150 entries, which is far too small to tell a scan from an
 * index lookup. Both are fast when the whole table fits in one page of cache.
 * Scans only show themselves as a *slope* across sizes, so this generates the
 * same shape of data at 150, 5k and 50k rows.
 *
 * The text is synthetic but realistically sized: SQLite reads whole pages, so
 * benchmarking against 20-character entries would understate every scan by
 * shrinking the table into far fewer pages than a real journal occupies.
 */

import bcrypt from "bcryptjs";

/** Deterministic PRNG, so two runs benchmark byte-identical databases. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS =
  `morning coffee rain window deadline sister call quiet walk river light tired
   grateful anxious steady progress sleep dream meeting run pages music kitchen
   evening pressure calm honest small win doubt friend message garden slow
   breathe notice pattern change work rest question answer patience` .split(/\s+/);

const TAG_POOL = [
  "calm", "anxious", "grateful", "tired", "focused", "restless",
  "hopeful", "flat", "energised", "reflective", "stressed", "content",
];

/**
 * Populates an empty database with `entryCount` entries for one user.
 * Returns the ids a benchmark needs to query with.
 */
export const BENCH_USER = {
  username: "bench",
  email: "bench@mindsage.local",
  // Hashed with bcrypt so `auth:login` succeeds. The app-level benchmark logs
  // in through the real IPC handler rather than forging a token, so it keeps
  // working if token verification is ever tightened.
  password: "benchpass123",
};

export function buildDataset(db, entryCount, { seed = 42 } = {}) {
  const rand = mulberry32(seed);

  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, timezone)
    VALUES (?, ?, ?, ?, ?)
  `);
  const userId = Number(
    insertUser.run(
      BENCH_USER.username,
      BENCH_USER.email,
      // One bcrypt hash per seeded database - a few hundred milliseconds, and
      // it is what lets the app-level benchmark log in normally.
      bcrypt.hashSync(BENCH_USER.password, 10),
      "Bench User",
      "Europe/London"
    ).lastInsertRowid
  );

  const insertTag = db.prepare(
    "INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)"
  );
  const selectTag = db.prepare(
    "SELECT id FROM tags WHERE user_id = ? AND name = ?"
  );
  const insertEntry = db.prepare(`
    INSERT INTO journal_entries (
      user_id, title, content, mood_score, sentiment_score,
      image_key, content_summary, created_at, updated_at,
      is_deleted, synced, sync_action, synced_to_qdrant
    ) VALUES (
      @userId, @title, @content, @mood, @sentiment,
      @imageKey, @summary, @createdAt, @createdAt,
      0, 1, 'create', 'success'
    )
  `);
  const linkTag = db.prepare(
    "INSERT INTO journal_entry_tags (journal_entry_id, tag_id) VALUES (?, ?)"
  );

  const tagIds = new Map();
  for (const name of TAG_POOL) {
    insertTag.run(userId, name);
    tagIds.set(name, selectTag.get(userId, name).id);
  }

  const entryIds = [];

  // One transaction for the whole build. Per-statement autocommit would fsync
  // 50,000 times and take minutes rather than seconds.
  const build = db.transaction(() => {
    // Entries run backwards from today, roughly two per day, so `created_at`
    // ordering and date-range filters both have realistic selectivity.
    const now = Date.now();
    for (let i = 0; i < entryCount; i++) {
      const daysAgo = Math.floor(i / 2);
      const createdAt = new Date(
        now - daysAgo * 86400000 - Math.floor(rand() * 43200000)
      ).toISOString();

      const wordCount = 120 + Math.floor(rand() * 280);
      const content = Array.from(
        { length: wordCount },
        () => WORDS[Math.floor(rand() * WORDS.length)]
      ).join(" ");

      const id = Number(
        insertEntry.run({
          userId,
          title: `Entry ${entryCount - i}`,
          content,
          mood: 1 + Math.floor(rand() * 5),
          sentiment: Math.round((rand() * 2 - 1) * 1000) / 1000,
          // A fifth of entries carry a photo, matching the dashboard's
          // image-bearing subset without inflating the DB with real files.
          imageKey: rand() < 0.2 ? `C:/bench/media/${i}.jpg` : null,
          summary: rand() < 0.6 ? content.slice(0, 180) : null,
          createdAt,
        }).lastInsertRowid
      );
      entryIds.push(id);

      const tagCount = 1 + Math.floor(rand() * 3);
      const used = new Set();
      for (let t = 0; t < tagCount; t++) {
        const name = TAG_POOL[Math.floor(rand() * TAG_POOL.length)];
        if (used.has(name)) continue;
        used.add(name);
        linkTag.run(id, tagIds.get(name));
      }
    }
  });

  build();

  return {
    userId,
    entryIds,
    // Mid-history id: querying only the newest entry would let a
    // `ORDER BY created_at DESC` shortcut look better than it is.
    sampleEntryId: entryIds[Math.floor(entryIds.length / 2)],
  };
}
