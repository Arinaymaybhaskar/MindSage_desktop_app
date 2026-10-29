import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { tempDir } from "../db/dbTestUtils.js";

// People and the trash against the real database: what a person page, an
// export, a merge and an ignore do with mentions of entries in the Trash.
vi.mock("electron", () => ({
  app: { getPath: () => process.env.MS_USER_DATA_DIR },
  ipcMain: { handle: () => {}, on: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
  powerMonitor: { isOnBatteryPower: () => false },
}));
// People is on for everyone here, and the AI runs through a fake Ollama.
vi.mock("electron-store", () => ({
  default: class {
    get(key) {
      if (key === "aiProvider") return "ollama";
      return String(key).startsWith("users.") ? { enabled: true } : undefined;
    }
    set() {}
  },
}));
const session = vi.hoisted(() => ({ userId: null }));
vi.mock("../session.js", () => ({ currentUserId: () => session.userId }));

let localDB;
let peopleDb;
let people;
let exportEverything;
let db;
let dir;
let alice;

beforeAll(async () => {
  dir = tempDir("mindsage-people");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("../db/index.js"));
  peopleDb = await import("../db/people.js");
  people = await import("./people.js");
  ({ exportEverything } = await import("../db/exportData.js"));
  db = localDB.db;
  localDB.initDatabase();
  alice = Number(
    db
      .prepare(
        `INSERT INTO users (username, email, password_hash) VALUES ('alice', 'alice@example.com', 'x')`,
      )
      .run().lastInsertRowid,
  );
  session.userId = alice;
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
  });
});

// One day apart, so summary excerpts are numbered in creation order.
let day = 0;
function entry(content) {
  const { id } = localDB.createJournalEntry(alice, {
    title: "t",
    content,
    mood_score: 3,
  });
  const at = new Date(Date.UTC(2026, 0, 1 + day++, 9)).toISOString();
  db.prepare(`UPDATE journal_entries SET created_at = ? WHERE id = ?`).run(
    at,
    id,
  );
  return id;
}
const trash = (id) => expect(localDB.deleteJournalEntry(alice, id)).toBe(1);
const restore = (...ids) => localDB.restoreItems(alice, { entryIds: ids });

function person(name, status = "confirmed") {
  const id = peopleDb.createPerson(alice, { displayName: name, status });
  peopleDb.addAlias(id, name, "user");
  return id;
}
function mention(personId, entryId, extra = {}) {
  peopleDb.insertMention({
    entry_id: entryId,
    person_id: personId,
    name_as_written: "Sam",
    sentence_start: 0,
    sentence_end: 5,
    valence: 1,
    feeling_tags: "[]",
    confidence: 0.9,
    extractor_version: 1,
    ...extra,
  });
}
/** A summary saved as handleSummarize would, matching the mentions now. */
async function summarise(personId, lines) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ response: JSON.stringify({ lines }) }),
  }));
  return people.handleSummarize(null, personId);
}
/** Exports; returns data.json and the text of every People part of the zip. */
let exportCount = 0;
async function exportPeople() {
  const out = path.join(dir, `export-${exportCount++}.zip`);
  await exportEverything(alice, out);
  const files = unzipSync(new Uint8Array(fs.readFileSync(out)));
  const data = JSON.parse(strFromU8(files["data.json"]));
  const text = JSON.stringify([
    data.people,
    data.person_aliases,
    data.person_summaries,
    data.person_mentions,
    ...Object.keys(files)
      .filter((f) => f.includes("people/"))
      .map((f) => strFromU8(files[f])),
  ]);
  return { data, text };
}
const mentionRows = (personId) =>
  db.prepare(`SELECT * FROM person_mentions WHERE person_id = ?`).all(personId);

describe("person summary and the trash", () => {
  it("drops summary lines citing a trashed entry and brings them back on restore", async () => {
    const p = person("Sam");
    const [a, b, c] = [entry("Sam A."), entry("Sam B."), entry("Sam C.")];
    for (const e of [a, b, c]) mention(p, e);
    // Excerpts are numbered oldest first: a = 1, b = 2, c = 3.
    const made = await summarise(p, [
      { text: "line a", sources: [1] },
      { text: "line b and c", sources: [2, 3] },
      { text: "line c", sources: [3] },
    ]);
    expect(made.lines.map((l) => l.text)).toEqual([
      "line a",
      "line b and c",
      "line c",
    ]);

    trash(c);
    const page = people.handleGetPerson(null, p);
    expect(page.summary.lines.map((l) => l.text)).toEqual(["line a"]);
    expect(JSON.stringify(page.summary)).not.toContain("line c");

    restore(c);
    const back = people.handleGetPerson(null, p);
    expect(back.summary.lines).toHaveLength(3);
    expect(back.summary.stale).toBe(false);
  });

  it("deletes the summary when fewer than two live entries remain, even with Ollama down", async () => {
    const p = person("Ria");
    const [a, b] = [entry("Ria A. Ria again."), entry("Ria B.")];
    mention(p, a);
    mention(p, a, { sentence_start: 6, sentence_end: 16 });
    mention(p, b);
    await summarise(p, [{ text: "both", sources: [1, 2] }]);
    expect(peopleDb.getSummary(p)).toBeTruthy();

    trash(b);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    });
    expect(people.handleGetPerson(null, p).summary).toBeNull();
    await expect(people.handleSummarize(null, p)).resolves.toEqual({
      lines: [],
      stale: false,
    });
    expect(peopleDb.getSummary(p)).toBeUndefined();

    // Restore: the mentions come back and a new summary can be made.
    restore(b);
    expect(people.handleGetPerson(null, p).mentionCount).toBe(2);
    const again = await summarise(p, [{ text: "again", sources: [1, 2] }]);
    expect(again.lines).toEqual([{ text: "again", entryIds: [a, b] }]);
  });
});

describe("export and the trash", () => {
  it("leaves out summaries of trashed entries, ignored people and names only trashed entries hold", async () => {
    const p = person("Lena");
    const [a, b, c] = [entry("Lena A."), entry("Lena B."), entry("Lena C.")];
    for (const e of [a, b, c]) mention(p, e);
    await summarise(p, [
      { text: "lena kept", sources: [1, 2] },
      { text: "lena trashed", sources: [3] },
    ]);
    // A summary left behind on an ignored person by an older version.
    const ig = person("Omar", "ignored");
    peopleDb.saveSummary(
      ig,
      JSON.stringify([{ text: "omar line", entryIds: [a] }]),
      "h",
      "m",
    );
    // A suggestion only a trashed entry names.
    const secret = entry("Zephyrine came by.");
    const s = peopleDb.createPerson(alice, {
      displayName: "Zephyrine",
      status: "suggested",
    });
    peopleDb.addAlias(s, "Zephyrine", "ai");
    mention(s, secret, { name_as_written: "Zephyrine" });
    trash(c);
    trash(secret);

    const { data, text } = await exportPeople();
    expect(text).toContain("lena kept");
    expect(text).not.toContain("lena trashed");
    expect(text).not.toContain("omar line");
    expect(text).not.toContain("Zephyrine");
    // An ignored person and their names stay out entirely.
    expect(text).not.toMatch(/omar/i);
    expect(data.person_aliases.some((x) => x.person_id === ig)).toBe(false);
  });

  it("leaves out a name the AI added that only trashed entries hold, until restore", async () => {
    const p = person("Bartholomew");
    peopleDb.addAlias(p, "Barty", "ai");
    const [a, t] = [entry("Bartholomew A."), entry("Barty T.")];
    mention(p, a, { name_as_written: "Bartholomew" });
    mention(p, t, { name_as_written: "Barty" });
    trash(t);

    const trashed = await exportPeople();
    expect(trashed.text).toContain("Bartholomew");
    expect(trashed.text).not.toMatch(/barty/i);

    restore(t);
    const back = await exportPeople();
    const names = back.data.person_aliases
      .filter((x) => x.person_id === p)
      .map((x) => x.alias);
    expect(names.sort()).toEqual(["Bartholomew", "Barty"]);
  });

  it("ignoring a person deletes their summary", async () => {
    const p = person("Ivo");
    const [a, b] = [entry("Ivo A."), entry("Ivo B.")];
    mention(p, a);
    mention(p, b);
    await summarise(p, [{ text: "ivo", sources: [1, 2] }]);
    people.handleIgnorePerson(null, p);
    expect(peopleDb.getSummary(p)).toBeUndefined();
  });
});

describe("merge and ignore with entries in the trash", () => {
  it("a merge carries mentions of trashed entries, verified ones included", () => {
    const keep = person("Max");
    const merge = person("Maxi");
    const [a, t] = [entry("Maxi A."), entry("Maxi T.")];
    mention(merge, a);
    mention(merge, t, { user_verified: 1 });
    trash(t);

    people.handleMergePeople(null, keep, merge);
    restore(t);
    const page = people.handleGetPerson(null, keep);
    expect(page.entries.map((e) => e.entryId).sort()).toEqual([a, t].sort());
    expect(
      page.entries.find((e) => e.entryId === t).mentions[0].userVerified,
    ).toBe(true);
  });

  it("undoing a merge gives back mentions of trashed entries", () => {
    const keep = person("Nia");
    const merge = person("Nini");
    const [a, t] = [entry("Nini A."), entry("Nini T.")];
    mention(merge, a);
    mention(merge, t, { user_verified: 1 });
    trash(t);

    const { undoToken } = people.handleMergePeople(null, keep, merge);
    people.handleUndoMerge(null, undoToken);
    restore(t);
    const restored = peopleDb
      .listPeople(alice, "confirmed")
      .find((x) => x.display_name === "Nini");
    const page = people.handleGetPerson(null, restored.id);
    expect(page.entries.map((e) => e.entryId).sort()).toEqual([a, t].sort());
    expect(people.handleGetPerson(null, keep).entries).toHaveLength(0);
  });

  it("ignoring a person removes their mentions of trashed entries too", () => {
    const p = person("Ugo");
    const [a, t] = [entry("Ugo A."), entry("Ugo T.")];
    mention(p, a);
    mention(p, t, { user_verified: 1 });
    trash(t);

    people.handleIgnorePerson(null, p);
    restore(t);
    expect(mentionRows(p)).toHaveLength(0);
  });
});

describe("extraction and the shared AI queue (KAN-392)", () => {
  it("waits while Ask answers, then runs", async () => {
    const { foreground } = await import("../ai/queue.js");
    entry(
      "Had lunch with Priya today and she told me all about her new job in the city.",
    );
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: JSON.stringify({ people: [] }) }),
    }));
    let endAsk;
    const ask = foreground(() => new Promise((resolve) => (endAsk = resolve)));
    people.handleRetryFailed(); // starts the People queue
    await vi.waitFor(() => expect(peopleDb.jobCounts(alice).running).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetch).not.toHaveBeenCalled();

    endAsk();
    await ask;
    await vi.waitFor(
      () => {
        const { queued, running } = peopleDb.jobCounts(alice);
        expect(queued + running).toBe(0);
      },
      { timeout: 5000 },
    );
    expect(fetch).toHaveBeenCalled();
  });

  it("an Ask that starts mid-call stops it, and it runs again after (KAN-438)", async () => {
    const { foreground } = await import("../ai/queue.js");
    const { eventBus } = await import("../eventBus.js");
    const id = entry(
      "Went hiking with Marco on Saturday morning and he showed me the old quarry trail by the river.",
    );
    const calls = [];
    const answer = {
      ok: true,
      json: async () => ({ response: JSON.stringify({ people: [] }) }),
    };
    globalThis.fetch = vi.fn((url, opts) => {
      if (!String(url).endsWith("/api/generate"))
        return Promise.resolve(answer);
      calls.push(opts.signal);
      // The first call hangs until it is aborted; the second answers.
      if (calls.length === 1)
        return new Promise((_, reject) =>
          opts.signal.addEventListener("abort", () =>
            reject(opts.signal.reason),
          ),
        );
      return Promise.resolve(answer);
    });
    eventBus.emit("journal:created", {
      userId: alice,
      entry: localDB.getJournalById(alice, id),
    });
    people.handleRetryFailed(); // runs the queue now, not after the 5 s delay
    await vi.waitFor(() => expect(calls).toHaveLength(1), { timeout: 5000 });

    let endAsk;
    const ask = foreground(() => new Promise((resolve) => (endAsk = resolve)));
    await vi.waitFor(() => expect(calls[0].aborted).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls).toHaveLength(1); // nothing new while Ask answers

    endAsk();
    await ask;
    await vi.waitFor(
      () => {
        const { queued, running, failed } = peopleDb.jobCounts(alice);
        expect(queued + running).toBe(0);
        expect(failed).toBe(0);
      },
      { timeout: 5000 },
    );
    expect(calls).toHaveLength(2);
  });
});
