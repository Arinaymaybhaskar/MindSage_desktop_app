/**
 * Seeds a photogenic demo profile for marketing screenshots and demo videos.
 *
 *   ELECTRON_RUN_AS_NODE=1 npx electron scripts/seed-demo.mjs --reset
 *   ELECTRON_RUN_AS_NODE=1 npx electron scripts/seed-demo.mjs --reset --photos ./my-photos
 *
 * ELECTRON_RUN_AS_NODE matters: better-sqlite3 is compiled against Electron's
 * ABI (see the `rebuild` / `postinstall` scripts in package.json), so a plain
 * `node scripts/seed-demo.mjs` throws NODE_MODULE_VERSION. That env var runs
 * Electron as bare Node, which has the right ABI and opens no window.
 *
 * This writes SQLite directly rather than going through IPC. The IPC create
 * path only accepts title / content / mood_score / mood_tags / created_at
 * (electron/db/journal.js:29-30) and cannot set content_summary, image_key,
 * audio_key, is_pinned, current_value or is_completed - all of which the good
 * screenshots need. Direct SQL also sidesteps the 15-minute JWT expiry in
 * electron/methods/auth.js:32 and needs no Ollama round-trip.
 *
 * Flags:
 *   --reset          wipe the demo user's data first (safe to re-run)
 *   --photos <dir>   folder of images for the dashboard "Memories" grid
 *   --audio <file>   a .wav to attach to the featured entry's audio player
 *   --avatar <file>  profile picture - the dashboard renders it at 320px
 *   --name <first>   override the persona's first name (default: Maya)
 *   --no-backup      skip the pre-flight database copy
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Sentiment from "sentiment";
import bcrypt from "bcryptjs";

import { db, initDatabase } from "../electron/db/connection.js";
import {
  HERO_ENTRIES,
  FILLER,
  FILLER_SUMMARIES,
  FILLER_TITLES,
  TAGS_BY_MOOD,
  GOALS,
  CHATS,
} from "./demo-data/corpus.mjs";

// ---------------------------------------------------------------- args ----

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const flagValue = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const RESET = hasFlag("--reset");
const PHOTOS_DIR = flagValue("--photos");
const AUDIO_FILE = flagValue("--audio");
const AVATAR_FILE = flagValue("--avatar");
const FIRST_NAME = flagValue("--name", "Maya");
const SKIP_BACKUP = hasFlag("--no-backup");

const PERSONA = {
  firstName: FIRST_NAME,
  fullName: `${FIRST_NAME} Kapoor`,
  username: FIRST_NAME.toLowerCase(),
  email: `${FIRST_NAME.toLowerCase()}@mindsage.local`,
  password: "demo1234",
  timezone: "Europe/London",
};

/** 10 weeks. Deliberately not a year - see the note on WEEKDAY_WEIGHTS. */
const HISTORY_DAYS = 70;
/** Days back from today where the unbroken streak starts and ends. */
const STREAK_RANGE = [0, 27];

// -------------------------------------------------------------- helpers ----

const sentiment = new Sentiment();

/**
 * Mirrors analyzeSentimentLocal in electron/db/journal.js:11-17 so seeded rows
 * carry exactly the score the app would have computed for the same text.
 */
const analyzeSentimentLocal = (text) => {
  if (!text) return 0;
  return Math.max(-1, Math.min(1, sentiment.analyze(text).score / 10));
};

/** Deterministic PRNG so re-runs produce identical data across video takes. */
let seedState = 0x2f6e2b1;
const rand = () => {
  seedState ^= seedState << 13;
  seedState ^= seedState >>> 17;
  seedState ^= seedState << 5;
  return ((seedState >>> 0) % 100000) / 100000;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
/**
 * Picks without repeating anything used in the last `window` calls. The journal
 * list renders ten cards per page, so a filler title recurring a few rows below
 * itself is plainly visible in exactly the screenshot we care about most.
 */
const recentlyUsed = new Map();
const pickFresh = (arr, key, window = 10) => {
  const seen = recentlyUsed.get(key) ?? [];
  const fresh = arr.filter((v) => !seen.includes(v));
  const value = pick(fresh.length ? fresh : arr);
  seen.push(value);
  while (seen.length > window) seen.shift();
  recentlyUsed.set(key, seen);
  return value;
};

const pickN = (arr, n) => {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
};

const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);

/**
 * UTC ISO string for a given local wall-clock time.
 *
 * The app stores `new Date().toISOString()` - a true UTC instant - so the
 * seeder must too. Formatting local clock components and appending "Z" instead
 * tags local time as UTC: in Asia/Calcutta (UTC+5:30) an entry written at 21:44
 * then renders as 03:14 the following day, so every evening entry lands in the
 * small hours of the wrong date and the journal list is headed by tomorrow.
 */
const isoAt = (dayOffset, hour, minute) => {
  const d = new Date(startOfToday);
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, minute, 0, 0);

  // Entries carry a fixed wall-clock hour, so an evening slot on day 0 lands in
  // the future whenever the seeder is run before that hour. The app itself
  // stamps `created_at` at write time and can never produce a future entry, so
  // one would be a giveaway that the data was fabricated: relative dates render
  // as "in 6 hours" and the entry sorts above things written after it. Pull any
  // such timestamp back to a few minutes ago.
  const now = Date.now();
  if (d.getTime() > now) return new Date(now - 7 * 60 * 1000).toISOString();

  return d.toISOString();
};

/** Local YYYY-MM-DD, for date-only columns like completed_date / target_date. */
const localDate = (dayOffset) => {
  const d = new Date(startOfToday);
  d.setDate(d.getDate() - dayOffset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const weekdayOf = (dayOffset) => {
  const d = new Date(startOfToday);
  d.setDate(d.getDate() - dayOffset);
  return d.getDay(); // 0 = Sunday
};

const dateOnly = (dayOffset) => localDate(dayOffset);

const log = (msg) => console.log(msg);

// ------------------------------------------------------------- pre-flight --

const dbPath = db.name;

if (!SKIP_BACKUP && fs.existsSync(dbPath)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${dbPath}.bak-${stamp}`;
  fs.copyFileSync(dbPath, backup);
  log(`Backed up database to:\n  ${backup}\n`);
}

log("Running migrations...");
initDatabase();

// ------------------------------------------------------------------ user --

let user = db
  .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
  .get(PERSONA.username, PERSONA.email);

if (user && !RESET) {
  console.error(
    `\nDemo user "${PERSONA.username}" already exists (id ${user.id}).\n` +
      `Re-run with --reset to rebuild it, which deletes only that user's data.\n`
  );
  process.exit(1);
}

if (!user) {
  const result = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, full_name, timezone)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      PERSONA.username,
      PERSONA.email,
      bcrypt.hashSync(PERSONA.password, 10),
      PERSONA.fullName,
      PERSONA.timezone
    );
  const userId = result.lastInsertRowid;
  db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
  user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  log(`Created user "${PERSONA.username}" (id ${user.id}).`);
} else {
  log(`Reusing user "${PERSONA.username}" (id ${user.id}).`);
}

const USER_ID = user.id;

if (RESET) {
  const wipe = db.transaction(() => {
    // journal_entry_tags, messages, files and progress_logs all cascade.
    db.prepare("DELETE FROM journal_entries WHERE user_id = ?").run(USER_ID);
    db.prepare("DELETE FROM tags WHERE user_id = ?").run(USER_ID);
    db.prepare("DELETE FROM goals WHERE user_id = ?").run(USER_ID);
    db.prepare("DELETE FROM chats WHERE user_id = ?").run(USER_ID);
  });
  wipe();
  log("Cleared previous demo data.");

  // Drop this user's vectors too. Qdrant lives outside SQLite, so deleting the
  // journals alone strands their embeddings: semantic search then returns hits
  // for entries that no longer exist, and each re-seed piles more on (276
  // vectors for 120 entries after a handful of runs). Best-effort - the seeder
  // is expected to run with the app closed, in which case Qdrant is not up.
  const qdrantPort = process.env.QDRANT_HTTP_PORT ?? "6333";
  try {
    const res = await fetch(
      `http://127.0.0.1:${qdrantPort}/collections/mind_entries/points/delete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: { must: [{ key: "user_id", match: { value: USER_ID } }] },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    log(
      res.ok
        ? "Cleared previous demo vectors from Qdrant."
        : `Qdrant point delete returned ${res.status} - stale vectors may remain.`
    );
  } catch {
    log("Qdrant not reachable - skipped vector cleanup (fine if the app is closed).");
  }
}

// ------------------------------------------------------------- day plan ----

/**
 * Entries per weekday, per week. The Weekly Habits chart divides total entries
 * on a weekday by the number of weeks in the whole history
 * (electron/db/dashboard.js:189-234), so a long thin history flattens every bar
 * toward zero. Ten weeks at these rates puts the bars around 1-3 with visible
 * shape. Note the chart's green threshold of >5 (dashBoard.tsx:228) compares
 * against this average and is effectively unreachable - indigo bars are the
 * correct, honest result, so don't try to chase green here.
 */
const WEEKDAY_WEIGHTS = { 0: 0.9, 1: 2.8, 2: 2.2, 3: 2.8, 4: 2.0, 5: 2.2, 6: 1.1 };

/** Mood drifts up over the history with weekly wobble - a story, not a line. */
const moodFor = (dayOffset) => {
  const progress = (HISTORY_DAYS - dayOffset) / HISTORY_DAYS; // 0 = oldest
  const trend = 2.7 + progress * 1.35;
  const wobble = Math.sin(dayOffset / 5.5) * 0.8;
  const noise = (rand() - 0.5) * 1.7;
  return Math.max(1, Math.min(5, Math.round(trend + wobble + noise)));
};

const moodBand = (mood) => (mood >= 4 ? "high" : mood <= 2 ? "low" : "mid");

/**
 * Filler entries have to carry real length, not just exist. The "Total Words"
 * stat card sums word counts across every entry (electron/db/dashboard.js:126-135),
 * so 60-word stubs make a 130-entry journal look like a fortnight of use. Two
 * items from each bank plus a reflection lands each entry around 200-260 words.
 */
const buildFiller = (mood) => {
  const band = moodBand(mood);
  const [work, work2] = pickN(FILLER.work, 2);
  const [body, life] = [pick(FILLER.body), pick(FILLER.life)];
  const parts = [
    pick(FILLER.openers[band]),
    work,
    body,
    work2,
    life,
    pick(FILLER.reflections[band]),
    pick(FILLER.closers[band]),
  ];
  return parts.join("\n\n");
};

const heroByDay = new Map(HERO_ENTRIES.map((e) => [e.dayOffset, e]));

/** How many entries each day gets. Streak days are guaranteed at least one. */
const dayPlan = [];
for (let dayOffset = HISTORY_DAYS - 1; dayOffset >= 0; dayOffset--) {
  const weight = WEEKDAY_WEIGHTS[weekdayOf(dayOffset)];
  let count = Math.floor(weight);
  if (rand() < weight - count) count += 1;

  const inStreak = dayOffset >= STREAK_RANGE[0] && dayOffset <= STREAK_RANGE[1];
  if (inStreak && count === 0) count = 1;
  if (!inStreak && rand() < 0.14) count = 0;
  const hero = heroByDay.get(dayOffset);
  if (hero && dayOffset <= 2) {
    // getDashboardData pulls exactly three recent journals
    // (electron/db/dashboard.js:32-38) and renders them as the dashboard's
    // Recent Entries cards. Keeping the three newest days to one entry each
    // guarantees all three cards are hand-written rather than filler.
    count = 1;
  } else if (hero) {
    // The mood calendar and the score chart both average per day. A hero entry
    // written at mood 1 gets washed out to a 3 by two neutral filler entries
    // on the same date, which flattens exactly the days that give the calendar
    // its range - so low days stay solo.
    count = hero.mood <= 2 ? 1 : Math.max(count, 1);
  }

  dayPlan.push({ dayOffset, count });
}

// -------------------------------------------------------------- entries ----

const insertEntry = db.prepare(`
  INSERT INTO journal_entries (
    user_id, title, content, mood_score, sentiment_score, transcription,
    content_summary, created_at, updated_at, is_deleted, synced, sync_action,
    synced_to_qdrant, ai_metadata_status, ai_summary_status
  ) VALUES (
    @user_id, @title, @content, @mood_score, @sentiment_score, @transcription,
    @content_summary, @created_at, @updated_at, 0, 0, 'create',
    'pending', 'completed', 'completed'
  )
`);

const insertTag = db.prepare(
  "INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)"
);
const selectTag = db.prepare(
  "SELECT id FROM tags WHERE user_id = ? AND name = ?"
);
const linkTag = db.prepare(
  "INSERT OR IGNORE INTO journal_entry_tags (journal_entry_id, tag_id) VALUES (?, ?)"
);

/**
 * synced_to_qdrant is written as 'pending', not left at its 'not_synced'
 * default, on purpose. The bulk-sync query (electron/qdrantWorker.js:531-533)
 * matches only ('pending','failed') OR NULL, so rows sitting at the column
 * default are invisible to it and would never be embedded - which would leave
 * the semantic-search screenshot returning nothing.
 */
const featuredEntryIds = [];
let entryCount = 0;

const seedEntries = db.transaction(() => {
  for (const { dayOffset, count } of dayPlan) {
    for (let i = 0; i < count; i++) {
      const hero = i === 0 ? heroByDay.get(dayOffset) : undefined;

      const mood = hero ? hero.mood : moodFor(dayOffset);
      const hour = hero ? hero.hour : 7 + Math.floor(rand() * 15);
      const minute = Math.floor(rand() * 60);
      const createdAt = isoAt(dayOffset, hour, minute);

      const content = hero ? hero.content : buildFiller(mood);
      const title = hero ? hero.title : null;
      const summary = hero
        ? hero.summary
        : pick(FILLER_SUMMARIES[moodBand(mood)]);
      const tags = hero ? hero.tags : pickN(TAGS_BY_MOOD[mood], 2 + Math.floor(rand() * 2));

      // Filler entries still need a title - a null title makes the journal list
      // card render an empty heading, and it would also flip needsAiCompletion
      // true if these rows were ever replayed through the create handler.
      const resolvedTitle =
        title || pickFresh(FILLER_TITLES[moodBand(mood)], `title-${moodBand(mood)}`);

      const result = insertEntry.run({
        user_id: USER_ID,
        title: resolvedTitle,
        content,
        mood_score: mood,
        sentiment_score: analyzeSentimentLocal(content),
        transcription: hero?.transcript ?? null,
        content_summary: summary,
        created_at: createdAt,
        updated_at: createdAt,
      });

      const journalId = result.lastInsertRowid;
      entryCount++;

      for (const tagName of tags) {
        insertTag.run(USER_ID, tagName);
        const tag = selectTag.get(USER_ID, tagName);
        if (tag) linkTag.run(journalId, tag.id);
      }

      if (hero?.feature) featuredEntryIds.push(journalId);
    }
  }
});

seedEntries();
log(`Inserted ${entryCount} journal entries across ${HISTORY_DAYS} days.`);

// ---------------------------------------------------------------- goals ----

const categoryId = (name) => {
  const row = db
    .prepare(
      "SELECT id FROM categories WHERE name = ? AND (user_id = ? OR user_id = 0) ORDER BY user_id DESC LIMIT 1"
    )
    .get(name, USER_ID);
  return row?.id ?? null;
};

const insertGoal = db.prepare(`
  INSERT INTO goals (
    user_id, category_id, title, description, parent_goal_title,
    current_value, target_value, unit, is_pinned, is_completed,
    created_at, completed_date, target_date, synced_to_qdrant
  ) VALUES (
    @user_id, @category_id, @title, @description, @parent_goal_title,
    @current_value, @target_value, @unit, @is_pinned, @is_completed,
    @created_at, @completed_date, @target_date, 'pending'
  )
`);

const insertLog = db.prepare(`
  INSERT INTO progress_logs (goal_id, value, description, logged_at, synced_to_qdrant)
  VALUES (?, ?, ?, ?, 'pending')
`);

/**
 * AddGoal (electron/db/goal.js:18-61) drops current_value, is_pinned and
 * is_completed entirely - they only exist on the update path - so goals are
 * written directly here rather than through it.
 */
const seedGoals = db.transaction(() => {
  for (const goal of GOALS) {
    const targetDate = goal.targetDate?.startsWith("+")
      ? dateOnly(-Number(goal.targetDate.slice(1)))
      : goal.targetDate ?? null;

    const result = insertGoal.run({
      user_id: USER_ID,
      category_id: categoryId(goal.category),
      title: goal.title,
      description: goal.description,
      parent_goal_title: goal.parent ?? null,
      current_value: goal.completed ? goal.target : goal.current,
      target_value: goal.target,
      unit: goal.unit,
      is_pinned: goal.pinned ? 1 : 0,
      is_completed: goal.completed ? 1 : 0,
      created_at: isoAt(HISTORY_DAYS - 2, 9, 0),
      completed_date: goal.completed ? dateOnly(goal.completedDayOffset ?? 0) : null,
      target_date: targetDate,
    });

    for (const entry of goal.logs ?? []) {
      insertLog.run(
        result.lastInsertRowid,
        entry.value,
        entry.description,
        isoAt(entry.dayOffset, 19, 30)
      );
    }
  }
});

seedGoals();
const goalCounts = db
  .prepare(
    "SELECT SUM(is_completed) AS done, COUNT(*) - SUM(is_completed) AS active, SUM(is_pinned) AS pinned FROM goals WHERE user_id = ?"
  )
  .get(USER_ID);
log(
  `Inserted ${GOALS.length} goals (${goalCounts.active} active, ${goalCounts.done} completed, ${goalCounts.pinned} pinned).`
);

// ---------------------------------------------------------------- chats ----

const insertChat = db.prepare(
  "INSERT INTO chats (user_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
);
const insertMessage = db.prepare(
  "INSERT INTO messages (chat_id, sender, content, created_at) VALUES (?, ?, ?, ?)"
);

const seedChats = db.transaction(() => {
  for (const chat of CHATS) {
    const created = isoAt(chat.dayOffset, 20, 15);
    const chatId = insertChat.run(
      USER_ID,
      chat.title,
      "llama3.1:8b",
      created,
      created
    ).lastInsertRowid;

    (chat.messages ?? []).forEach((message, index) => {
      insertMessage.run(
        chatId,
        message.sender,
        message.content,
        isoAt(chat.dayOffset, 20, 15 + index * 2)
      );
    });
  }
});

seedChats();
log(`Inserted ${CHATS.length} chats.`);

// ---------------------------------------------------------------- media ----

/**
 * Mirrors handleSaveMedia (electron/methods/media.js:73-90): files live under
 * <userData>/media/journals/<journalId>/ and image_key holds the absolute path.
 * userData resolves to the same %APPDATA%/MindSage the database uses.
 */
const userDataDir = path.dirname(dbPath);

const attachImages = () => {
  if (!PHOTOS_DIR) {
    log(
      "\nNo --photos given. The dashboard's Memories grid needs >=10 entries\n" +
        "with image_key set, so it will render empty until you re-run with\n" +
        "  --photos <folder-of-images>"
    );
    return 0;
  }

  if (!fs.existsSync(PHOTOS_DIR)) {
    console.error(`--photos directory not found: ${PHOTOS_DIR}`);
    return 0;
  }

  const photos = fs
    .readdirSync(PHOTOS_DIR)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => path.join(PHOTOS_DIR, f));

  if (!photos.length) {
    console.error(`No images found in ${PHOTOS_DIR}`);
    return 0;
  }

  if (photos.length < 12) {
    log(
      `Only ${photos.length} photos found. The grid picks 10 at random, so 12+ keeps it full.`
    );
  }

  // Spread images across recent entries so the grid and the recent-entry cards
  // both have pictures, rather than clustering them all on one day.
  const targets = db
    .prepare(
      `SELECT id FROM journal_entries
       WHERE user_id = ? AND is_deleted = 0
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(USER_ID, Math.min(photos.length, 24));

  const setImage = db.prepare(
    "UPDATE journal_entries SET image_key = ? WHERE id = ?"
  );

  let attached = 0;
  const run = db.transaction(() => {
    targets.forEach((row, index) => {
      const source = photos[index % photos.length];
      const mediaDir = path.join(
        userDataDir,
        "media",
        "journals",
        String(row.id)
      );
      fs.mkdirSync(mediaDir, { recursive: true });
      const dest = path.join(
        mediaDir,
        `${Date.now() + index}-${path.basename(source)}`
      );
      fs.copyFileSync(source, dest);
      setImage.run(dest, row.id);
      attached++;
    });
  });
  run();
  return attached;
};

const attachAudio = () => {
  if (!AUDIO_FILE || !featuredEntryIds.length) return false;
  if (!fs.existsSync(AUDIO_FILE)) {
    console.error(`--audio file not found: ${AUDIO_FILE}`);
    return false;
  }
  const journalId = featuredEntryIds[0];
  const mediaDir = path.join(userDataDir, "media", "journals", String(journalId));
  fs.mkdirSync(mediaDir, { recursive: true });
  const dest = path.join(mediaDir, `${Date.now()}-voice-note.wav`);
  fs.copyFileSync(AUDIO_FILE, dest);
  db.prepare("UPDATE journal_entries SET audio_key = ? WHERE id = ?").run(
    dest,
    journalId
  );
  return true;
};

/**
 * The dashboard header renders the avatar at w-80 h-80 (dashBoard.tsx:444).
 * With no profile picture it collapses to a single-letter chip and the header
 * reads as broken, so the hero shot really wants one set.
 */
const attachAvatar = () => {
  if (!AVATAR_FILE) return false;
  if (!fs.existsSync(AVATAR_FILE)) {
    console.error(`--avatar file not found: ${AVATAR_FILE}`);
    return false;
  }
  const profileDir = path.join(userDataDir, "media", "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  const dest = path.join(
    profileDir,
    `${Date.now()}-${path.basename(AVATAR_FILE)}`
  );
  fs.copyFileSync(AVATAR_FILE, dest);
  db.prepare("UPDATE users SET profile_picture = ? WHERE id = ?").run(
    dest,
    USER_ID
  );
  return true;
};

const imagesAttached = attachImages();
if (imagesAttached) log(`Attached ${imagesAttached} images.`);
if (attachAudio()) log("Attached audio to the featured entry.");
if (attachAvatar()) log("Set profile picture.");
else if (!AVATAR_FILE)
  log("No --avatar given. The dashboard header will show a letter chip.");

// --------------------------------------------------------------- summary ----

const stats = db
  .prepare(
    `SELECT
       COUNT(*) AS entries,
       COUNT(DISTINCT DATE(created_at)) AS days,
       ROUND(AVG(mood_score), 2) AS avgMood,
       SUM(LENGTH(TRIM(content)) - LENGTH(REPLACE(TRIM(content), ' ', '')) + 1) AS words
     FROM journal_entries WHERE user_id = ? AND is_deleted = 0`
  )
  .get(USER_ID);

const { streak } = db
  .prepare(
    `WITH DayStreaks AS (
       SELECT DATE(created_at) AS entry_date,
              DATE(created_at, '-' || (ROW_NUMBER() OVER (ORDER BY DATE(created_at))) || ' days') AS streak_group
       FROM (SELECT DISTINCT DATE(created_at) AS created_at
             FROM journal_entries WHERE user_id = ? AND is_deleted = 0)
     )
     SELECT COUNT(*) AS streak FROM DayStreaks
     GROUP BY streak_group ORDER BY streak DESC LIMIT 1`
  )
  .get(USER_ID) ?? { streak: 0 };

log(`
Done.

  Login       ${PERSONA.email}  /  ${PERSONA.password}
  Entries     ${stats.entries} across ${stats.days} distinct days
  Words       ${stats.words?.toLocaleString() ?? 0}
  Avg mood    ${stats.avgMood} / 5
  Streak      ${streak} days
  Images      ${imagesAttached}

Next:
  1. npm run dev, then log in as ${PERSONA.email}
  2. In DevTools: localStorage.setItem("setup_complete", "1"); localStorage.setItem("zoom_scale", "100")
  3. With Ollama + nomic-embed-text running, embed for semantic search:
     await window.electron.ipcRenderer.invoke("qdrant:bulk-sync")
`);

db.close();
