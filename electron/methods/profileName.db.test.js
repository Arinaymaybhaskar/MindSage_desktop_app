import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { tempDir } from "../db/dbTestUtils.js";

// One profile name (KAN-67) against the real database: sign-up and rename
// take any script and emoji, refuse a name another profile has, and sign-in
// is by profile name only.
vi.mock("electron", () => ({
  app: { getPath: () => process.env.MS_USER_DATA_DIR },
  ipcMain: { handle: () => {}, on: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("electron-store", () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {}
  },
}));
const session = vi.hoisted(() => ({ userId: null }));
vi.mock("../session.js", () => ({
  currentUserId: () => session.userId,
  signIn: (user) => (session.userId = user.id),
  signOut: () => (session.userId = null),
  restoreRememberedSession: () => null,
}));
vi.mock("./media.js", () => ({
  getThumbnailBase64: async () => null,
  writeProfileImage: () => null,
}));
vi.mock("./profileDelete.js", () => ({}));
vi.mock("../windowStorage.js", () => ({}));

let db;
let auth;
let user;
let dir;

beforeAll(async () => {
  dir = tempDir("mindsage-profile-name");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  const { default: localDB } = await import("../db/index.js");
  auth = await import("./auth.js");
  user = await import("./user.js");
  db = localDB.db;
  localDB.initDatabase();
});

afterAll(() => {
  db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const register = (username) =>
  auth.handleRegister(null, { username, password: "pw", timezone: "UTC" });

describe("profile name (KAN-67)", () => {
  it("signs up with emoji and non-Latin names, trimmed, no email or full name", async () => {
    await register("  मीरा 🌙 ");
    await register("José");
    const row = db
      .prepare(
        "SELECT username, email, full_name FROM users WHERE username = ?",
      )
      .get("मीरा 🌙");
    expect(row).toEqual({ username: "मीरा 🌙", email: null, full_name: null });

    const { userInfo } = await auth.handleLogin(null, {
      identifier: "मीरा 🌙",
      password: "pw",
    });
    expect(userInfo.username).toBe("मीरा 🌙");
    expect(userInfo).not.toHaveProperty("email");
    expect(userInfo).not.toHaveProperty("full_name");
  });

  it("refuses an empty name and a name another profile has", async () => {
    await expect(register("   ")).rejects.toThrow(/Enter a profile name/);
    await expect(register("José")).rejects.toThrow(/already exists/);
    // The decomposed form is the same name once normalised.
    await expect(register("José")).rejects.toThrow(/already exists/);
    expect(await auth.handleCheckUsername(null, "José")).toMatchObject({
      available: false,
      error: expect.stringMatching(/already exists/),
    });
    expect(await auth.handleCheckUsername(null, "a/b")).toMatchObject({
      available: false,
      error: expect.stringMatching(/can use/),
    });
    expect(await auth.handleCheckUsername(null, "新しい")).toEqual({
      available: true,
    });
  });

  it("treats names that differ only by case as the same (KAN-440)", async () => {
    await expect(register("josé")).rejects.toThrow(/already exists/);
    expect(await auth.handleCheckUsername(null, "JOSÉ")).toMatchObject({
      available: false,
    });
    await auth.handleLogin(null, { identifier: "José", password: "pw" });
    await register("Анна");
    await expect(
      user.userUpdateProfile(null, { username: "АННА" }),
    ).rejects.toThrow(/already exists/);
    // Changing only the case of its own name is allowed.
    await expect(
      user.userUpdateProfile(null, { username: "JOSÉ" }),
    ).resolves.toMatchObject({ user: { username: "JOSÉ" } });
    await user.userUpdateProfile(null, { username: "José" });
    // Profiles that already clash still sign in by their exact name.
    const hash = (await import("bcryptjs")).default.hashSync("pw", 4);
    db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(
      "Dup",
      hash,
    );
    db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(
      "dup",
      hash,
    );
    for (const name of ["Dup", "dup"]) {
      await expect(
        auth.handleLogin(null, { identifier: name, password: "pw" }),
      ).resolves.toMatchObject({ userInfo: { username: name } });
    }
  });

  it("treats the seeded System name as taken, at any case (KAN-476)", async () => {
    for (const name of ["System", "system", "SYSTEM"]) {
      await expect(register(name)).rejects.toThrow(/already exists/);
      expect(await auth.handleCheckUsername(null, name)).toMatchObject({
        available: false,
        error: expect.stringMatching(/already exists/),
      });
    }
    await auth.handleLogin(null, { identifier: "José", password: "pw" });
    await expect(
      user.userUpdateProfile(null, { username: "system" }),
    ).rejects.toThrow(/already exists/);
  });

  it("signs in by profile name only, not by email", async () => {
    db.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES ('legacy', 'old@example.com', ?)",
    ).run((await import("bcryptjs")).default.hashSync("pw", 4));
    await expect(
      auth.handleLogin(null, { identifier: "old@example.com", password: "pw" }),
    ).rejects.toThrow(/User not found/);
    await expect(
      auth.handleLogin(null, { identifier: " legacy ", password: "pw" }),
    ).resolves.toMatchObject({ userInfo: { username: "legacy" } });
  });

  it("renames with the same rule and refuses another profile's name", async () => {
    await auth.handleLogin(null, { identifier: "José", password: "pw" });
    await expect(
      user.userUpdateProfile(null, { username: "मीरा 🌙" }),
    ).rejects.toThrow(/already exists/);
    await expect(
      user.userUpdateProfile(null, { username: "" }),
    ).rejects.toThrow(/Enter a profile name/);
    // Keeping its own name is not a clash, and the picture is left alone.
    db.prepare("UPDATE users SET profile_picture = 'p.jpg' WHERE id = ?").run(
      session.userId,
    );
    const { user: same } = await user.userUpdateProfile(null, {
      username: "José",
    });
    expect(same).toMatchObject({ username: "José", profile_picture: "p.jpg" });

    const { user: renamed } = await user.userUpdateProfile(null, {
      username: " Жозе 🎸 ",
    });
    expect(renamed).toMatchObject({
      username: "Жозе 🎸",
      profile_picture: "p.jpg",
    });
    expect(renamed).not.toHaveProperty("email");
    const { user: noPicture } = await user.userUpdateProfile(null, {
      profile_picture: null,
    });
    expect(noPicture).toMatchObject({
      username: "Жозе 🎸",
      profile_picture: null,
    });
  });
});
