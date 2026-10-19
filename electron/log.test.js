import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createLogger,
  formatLine,
  installConsole,
  logFromRenderer,
} from "./log.js";

const PHRASE = "unique-diary-phrase-9d2c41";
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-log-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const allLogText = () =>
  fs
    .readdirSync(dir)
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");

describe("levels", () => {
  it("keeps info and above by default, debug only with MS_DEBUG=1", () => {
    const quiet = createLogger({ dir, level: "info" });
    quiet.debug("hidden");
    quiet.info("shown");
    expect(allLogText()).toMatch(/shown/);
    expect(allLogText()).not.toMatch(/hidden/);

    const old = process.env.MS_DEBUG;
    process.env.MS_DEBUG = "1";
    try {
      const loud = createLogger({ dir });
      loud.debug("now shown");
      expect(allLogText()).toMatch(/now shown/);
    } finally {
      if (old === undefined) delete process.env.MS_DEBUG;
      else process.env.MS_DEBUG = old;
    }
  });

  it("writes a timestamp, the level and the message on one line", () => {
    const l = createLogger({ dir });
    l.warn("careful", { id: 3 });
    expect(allLogText().trim()).toMatch(
      /^\d{4}-\d\d-\d\dT.+ WARN careful \[\{"id":3\}\]$/,
    );
  });

  it("keeps a multi-line message on one line", () => {
    expect(formatLine("info", ["a\nb"], {})).not.toMatch(/\n/);
  });
});

describe("rotation", () => {
  it("never keeps more than 5 files of 1 MB each", () => {
    const l = createLogger({
      dir,
      maxBytes: 1024 * 1024,
      rate: { limit: 1e9, windowMs: 1 },
    });
    const line = "x".repeat(150);
    for (let i = 0; i < 40_000; i += 1)
      l.info(`line ${i} ${line.slice(0, 120)}`);
    const files = fs.readdirSync(dir).sort();
    expect(files.length).toBeLessThanOrEqual(5);
    let total = 0;
    for (const f of files) {
      const size = fs.statSync(path.join(dir, f)).size;
      expect(size).toBeLessThanOrEqual(1024 * 1024);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(files).toContain("mindsage.log");
    expect(files).toContain("mindsage.4.log");
  }, 30_000);

  it("carries on from the size of an existing file after a restart", () => {
    fs.writeFileSync(
      path.join(dir, "mindsage.log"),
      "y".repeat(1024 * 1024 - 10),
    );
    const l = createLogger({ dir, maxBytes: 1024 * 1024 });
    l.info("this pushes it over");
    expect(fs.existsSync(path.join(dir, "mindsage.1.log"))).toBe(true);
    expect(fs.readFileSync(path.join(dir, "mindsage.log"), "utf8")).toMatch(
      /pushes it over/,
    );
  });
});

describe("a folder that cannot be written", () => {
  it("falls back to memory and keeps the app running", () => {
    const blocker = path.join(dir, "not-a-folder");
    fs.writeFileSync(blocker, "file");
    const l = createLogger({ dir: path.join(blocker, "logs") });
    expect(l.writingToFile()).toBe(false);
    expect(() => l.error("still fine")).not.toThrow();
    expect(l.recent().join("\n")).toMatch(/still fine/);
  });

  it("falls back when the disk fails mid-run", () => {
    const l = createLogger({ dir });
    l.info("first");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.writeFileSync(dir, "now a file");
    expect(() => l.info("second")).not.toThrow();
    expect(l.writingToFile()).toBe(false);
    expect(l.recent().join("\n")).toMatch(/second/);
    fs.rmSync(dir, { force: true });
    fs.mkdirSync(dir);
  });
});

describe("rate limit", () => {
  it("suppresses a chatty loop and says how many it dropped", () => {
    let t = 1_000_000;
    const l = createLogger({
      dir,
      rate: { limit: 5, windowMs: 1000 },
      now: () => t,
    });
    for (let i = 0; i < 100; i += 1) l.info("same message every time");
    t += 2000;
    l.info("same message every time");
    const text = allLogText();
    expect(text.match(/same message every time/g).length).toBeLessThan(10);
    expect(text).toMatch(/95 similar lines suppressed/);
  });

  it("does not suppress different messages", () => {
    const l = createLogger({ dir, rate: { limit: 2, windowMs: 1000 } });
    for (let i = 0; i < 20; i += 1)
      l.info(`distinct message ${String.fromCharCode(65 + i)}`);
    expect(allLogText().match(/distinct message/g)).toHaveLength(20);
  });
});

describe("no journal text in the logs", () => {
  let restore;
  afterEach(() => restore?.());

  it("keeps a seeded phrase out of every call shape the app uses", async () => {
    const l = createLogger({ dir });
    const { currentLogger, initLogging } = await import("./log.js");
    initLogging({ dir });
    restore = installConsole();
    void l;

    // The shapes that existed in the code before the logger.
    console.error("[addMessage] Error:", new Error("db busy"));
    console.error("Params:", {
      chatId: 1,
      sender: "user",
      content: PHRASE,
      sources: [PHRASE],
      files: [],
    });
    console.error("Params:", {
      userId: 1,
      chatData: { title: PHRASE, messages: [PHRASE] },
    });
    console.log("Custom test event received with data:", {
      title: PHRASE,
      content: PHRASE,
    });
    console.log("ai response", PHRASE.repeat(20));
    console.log({ model: "llama", prompt: PHRASE });
    console.log("Validated propsRes:", {
      requiresContext: true,
      query: PHRASE,
    });
    console.warn(
      "Failed to read",
      `C:\\Users\\a\\AppData\\Roaming\\MindSage\\media\\journals\\5\\${PHRASE}.png`,
    );
    console.log(
      `Combined data exported to: /home/a/media/chats/2/3/${PHRASE}.zip`,
    );
    currentLogger().error("direct", { summary: PHRASE, mood_tags: [PHRASE] });

    const text = allLogText();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain(PHRASE);
    expect(currentLogger().recent().join("\n")).not.toContain(PHRASE);
  });

  it("captures console output into the file and restores the console", async () => {
    const { initLogging } = await import("./log.js");
    initLogging({ dir });
    const before = console.log;
    const undo = installConsole();
    expect(console.log).not.toBe(before);
    console.info("hello from console");
    undo();
    expect(console.log).toBe(before);
    expect(allLogText()).toMatch(/hello from console/);
  });

  it("mirrors to the original console only when asked", async () => {
    const { initLogging } = await import("./log.js");
    initLogging({ dir });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const undo = installConsole({ mirror: true });
    console.log("mirrored");
    undo();
    expect(spy).toHaveBeenCalledWith("mirrored");
    spy.mockRestore();
  });
});

describe("lines from a window", () => {
  it("accepts a warn or error with a few small arguments", () => {
    const l = createLogger({ dir });
    expect(
      logFromRenderer(l, {
        level: "error",
        args: ["boom", { id: 1, content: PHRASE }],
      }),
    ).toBe(true);
    const text = allLogText();
    expect(text).toMatch(/\[renderer\] boom/);
    expect(text).not.toContain(PHRASE);
  });

  it("refuses anything else", () => {
    const l = createLogger({ dir });
    expect(logFromRenderer(l, null)).toBe(false);
    expect(logFromRenderer(l, { level: "debug", args: ["x"] })).toBe(false);
    expect(logFromRenderer(l, { level: "info", args: ["x"] })).toBe(false);
    expect(logFromRenderer(l, { level: "error", args: [] })).toBe(false);
    expect(
      logFromRenderer(l, { level: "error", args: Array(9).fill("x") }),
    ).toBe(false);
    expect(
      logFromRenderer(l, { level: "error", args: ["x".repeat(5000)] }),
    ).toBe(false);
    expect(logFromRenderer(l, { level: "error", args: "nope" })).toBe(false);
    expect(fs.existsSync(path.join(dir, "mindsage.log"))).toBe(false);
  });
});
