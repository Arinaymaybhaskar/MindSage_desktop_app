import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { tempDir } from "./dbTestUtils.js";

// Two profiles, A and B. Everything Ask's tools can do runs as A, hostile SQL
// included, and none of B's rows may come back or change (KAN-454).
vi.mock("electron", () => ({
  ipcMain: { handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("../ai/client.js", () => ({ embed: vi.fn() }));
const session = vi.hoisted(() => ({ userId: null }));
vi.mock("../session.js", () => ({ currentUserId: () => session.userId }));

let localDB;
let db;
let ai;
let idx;
let search;
let dir;
let a;
let b;

const DIM = 768;
const vec = () => {
  const v = new Array(DIM).fill(0);
  v[3] = 1;
  return v;
};

/** One of everything a tool could touch, for one profile. */
function seed(userId, name) {
  const run = (sql, ...args) =>
    Number(db.prepare(sql).run(...args).lastInsertRowid);
  const entry = run(
    `INSERT INTO journal_entries (user_id, title, content) VALUES (?, ?, ?)`,
    userId,
    `${name} entry`,
    `${name} wrote about the sea`,
  );
  const goal = run(
    `INSERT INTO goals (user_id, title, target_value, unit) VALUES (?, ?, 10, 'km')`,
    userId,
    `${name} goal`,
  );
  run(
    `INSERT INTO progress_logs (goal_id, value, description) VALUES (?, 1, ?)`,
    goal,
    `${name} ran`,
  );
  run(`INSERT INTO tags (user_id, name) VALUES (?, ?)`, userId, `${name}-tag`);
  run(`INSERT INTO chats (user_id, title) VALUES (?, ?)`, userId, `${name}`);
  return { entry, goal };
}

/** Every row of B's, so a test can show nothing changed. */
const rowsOf = (userId) => ({
  entries: db
    .prepare(`SELECT * FROM journal_entries WHERE user_id = ?`)
    .all(userId),
  goals: db.prepare(`SELECT * FROM goals WHERE user_id = ?`).all(userId),
  logs: db
    .prepare(
      `SELECT l.* FROM progress_logs l JOIN goals g ON g.id = l.goal_id
        WHERE g.user_id = ?`,
    )
    .all(userId),
  tags: db.prepare(`SELECT * FROM tags WHERE user_id = ?`).all(userId),
  chats: db.prepare(`SELECT * FROM chats WHERE user_id = ?`).all(userId),
});

beforeAll(async () => {
  dir = tempDir("mindsage-aiguard");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("./index.js"));
  ai = await import("./aiConnection.js");
  idx = await import("./searchIndex.js");
  search = await import("../methods/search.js");
  db = localDB.db;
  localDB.initDatabase();
  const user = (n) =>
    Number(
      db
        .prepare(
          `INSERT INTO users (username, email, password_hash) VALUES (?, ?, 'x')`,
        )
        .run(n, `${n}@example.com`).lastInsertRowid,
    );
  a = user("a");
  b = user("b");
  for (const [id, name] of [
    [a, "A"],
    [b, "B"],
  ]) {
    const { entry } = seed(id, name);
    const source = idx.loadSource("journal", entry);
    idx.markStale("journal", entry, id);
    idx.storeVector("journal", entry, vec(), source.hash);
  }
  session.userId = a;
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const HOSTILE = [
  `UPDATE journal_entries SET content = 'gone' WHERE user_id = $B`,
  `UPDATE journal_entries SET content = 'gone'`,
  `DELETE FROM journal_entries`,
  `INSERT INTO journal_entries (user_id, content) VALUES ($B, 'planted')`,
  `UPDATE journal_entries SET user_id = $B WHERE user_id = $A`,
  `UPDATE goals SET title = 'gone'`,
  `DELETE FROM goals WHERE user_id = $B`,
  `UPDATE progress_logs SET value = 999`,
  `DELETE FROM progress_logs`,
  `INSERT INTO progress_logs (goal_id, value)
     SELECT id, 1 FROM goals WHERE user_id = $B`,
  `UPDATE tags SET name = 'gone'`,
  `INSERT INTO tags (user_id, name) VALUES ($B, 'planted')`,
  `DELETE FROM chats`,
  `UPDATE chats SET user_id = $A`,
];

describe("the AI connection's profile guard", () => {
  it("refuses every write that reaches another profile's rows", () => {
    const before = rowsOf(b);
    for (const sql of HOSTILE) {
      const text = sql.replaceAll("$A", a).replaceAll("$B", b);
      expect(() => ai.aiDb().exec(text), text).toThrow(ai.GUARD_MESSAGE);
    }
    expect(rowsOf(b)).toEqual(before);
  });

  it("lets a write to the signed-in profile's own rows through", () => {
    const changed = ai
      .aiDb()
      .prepare(`UPDATE tags SET name = 'A-renamed' WHERE user_id = ?`)
      .run(a).changes;
    expect(changed).toBe(1);
  });

  it("refuses every write when nobody is signed in", () => {
    session.userId = null;
    try {
      expect(() =>
        ai
          .aiDb()
          .prepare(`UPDATE tags SET name = 'x' WHERE user_id = ?`)
          .run(a),
      ).toThrow(ai.GUARD_MESSAGE);
    } finally {
      session.userId = a;
    }
  });

  it("follows a profile switch at once", () => {
    session.userId = b;
    try {
      expect(() =>
        ai
          .aiDb()
          .prepare(`UPDATE tags SET name = 'x' WHERE user_id = ?`)
          .run(a),
      ).toThrow(ai.GUARD_MESSAGE);
    } finally {
      session.userId = a;
    }
  });
});

describe("Ask's search as profile A", () => {
  it("returns A's entry and never B's, though both match", () => {
    const hits = search.semanticSearch(vec(), a, 10, { threshold: 0 });
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit.payload.user_id).toBe(a);
  });
});
