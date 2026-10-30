import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { columnNames, tempDir } from "./dbTestUtils.js";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.MS_USER_DATA_DIR },
  ipcMain: { handle: () => {}, on: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("electron-store", () => ({
  default: class {
    get() {
      return null;
    }
    set() {}
  },
}));

// user:update-settings passes the renderer's object straight to
// updateUserSettings, whose keys become column names (KAN-481).
let localDB;
let SETTINGS_COLUMNS;
let db;
let dir;
let userId;

beforeAll(async () => {
  dir = tempDir("mindsage-settings");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("./index.js"));
  ({ SETTINGS_COLUMNS } = await import("./user.js"));
  db = localDB.db;
  localDB.initDatabase();
  userId = Number(
    db
      .prepare("INSERT INTO users (username, password_hash) VALUES ('a', 'x')")
      .run().lastInsertRowid,
  );
  db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
});
afterAll(() => {
  db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const row = () =>
  db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);

describe("updateUserSettings (KAN-481)", () => {
  it("allows every settings column and nothing else", () => {
    const readOnly = [
      "user_id",
      "created_at",
      "updated_at",
      "synced",
      "sync_action",
    ];
    expect([...SETTINGS_COLUMNS].sort()).toEqual(
      columnNames(db, "user_settings")
        .filter((c) => !readOnly.includes(c))
        .sort(),
    );
  });

  it("saves the keys the Colors panel sends", () => {
    localDB.updateUserSettings(userId, {
      custom_colors: '{"primary":"#123456"}',
      selected_theme: "Ocean",
      use_custom_colors: true,
    });
    expect(row()).toMatchObject({
      custom_colors: '{"primary":"#123456"}',
      selected_theme: "Ocean",
      use_custom_colors: 1,
    });
  });

  it.each([
    ["an unknown key", { not_a_column: 1 }],
    ["user_id", { user_id: 999 }],
    ["id", { id: 999 }],
    ["created_at", { created_at: "2000-01-01" }],
    ["updated_at", { updated_at: "2000-01-01" }],
    [
      "a key containing SQL",
      { "dark_mode = 1, selected_theme = 'pwned' --": 0 },
    ],
  ])("refuses %s and writes nothing", (_label, payload) => {
    const before = row();
    expect(() =>
      localDB.updateUserSettings(userId, { dark_mode: 1, ...payload }),
    ).toThrow(/Unknown setting/);
    expect(row()).toEqual(before);
  });
});
