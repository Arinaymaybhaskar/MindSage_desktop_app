import fs from "node:fs";
import path from "node:path";
import { redact, redactString } from "./logRedact.js";

// The app's one logger (KAN-170): levels, a rotating file in userData/logs
// (5 files of 1 MB at most), redaction of anything that could be journal
// content, a rate limit for chatty loops, and a memory fallback so a folder
// that cannot be written never stops the app. No Electron import: the main
// process, tests and anything else can use it, and the folder is passed in.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MEMORY_LINES = 500;
const FILE_NAME = "mindsage";

const pad = (n) => (n === 0 ? "" : `.${n}`);
const fileFor = (dir, n) => path.join(dir, `${FILE_NAME}${pad(n)}.log`);

/** One line of text for a console-style call: a message, then safe details. */
export function formatLine(level, args, redactOptions, now = Date.now) {
  const [first, ...rest] = args;
  const message =
    typeof first === "string"
      ? redactString(first, redactOptions)
      : JSON.stringify(redact(first, redactOptions));
  let details = "";
  if (rest.length) {
    details = ` ${JSON.stringify(rest.map((a) => redact(a, redactOptions)))}`;
    if (details.length > 2000)
      details = ` [${details.length} chars of details]`;
  }
  return `${new Date(now()).toISOString()} ${level.toUpperCase()} ${message}${details}`.replace(
    /\r?\n/g,
    "\\n",
  );
}

/**
 * @param {object} [options]
 * @param {string | null} [options.dir] Folder for the files; none means memory only.
 * @param {"debug"|"info"|"warn"|"error"} [options.level] Defaults to info, or debug with MS_DEBUG=1.
 * @param {number} [options.maxBytes] Size at which a file rotates (default 1 MB).
 * @param {number} [options.files] How many files to keep (default 5).
 * @param {Array<[string, string]>} [options.replacements] Folder to token pairs for redaction.
 * @param {(level: string, args: unknown[]) => void} [options.mirror] Also called for every line that is kept (dev console).
 * @param {{ limit: number, windowMs: number }} [options.rate]
 * @param {() => number} [options.now]
 */
export function createLogger({
  dir = null,
  level = process.env.MS_DEBUG === "1" ? "debug" : "info",
  maxBytes = 1024 * 1024,
  files = 5,
  replacements = [],
  mirror = null,
  rate = { limit: 50, windowMs: 10_000 },
  now = Date.now,
} = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const redactOptions = { replacements };
  const memory = [];
  let toFile = Boolean(dir);
  let size = 0;
  const buckets = new Map();

  const remember = (line) => {
    memory.push(line);
    if (memory.length > MEMORY_LINES) memory.shift();
  };

  if (toFile) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      size = fs.existsSync(fileFor(dir, 0))
        ? fs.statSync(fileFor(dir, 0)).size
        : 0;
    } catch {
      toFile = false; // not writable: memory only
    }
  }

  const rotate = () => {
    fs.rmSync(fileFor(dir, files - 1), { force: true });
    for (let n = files - 2; n >= 0; n -= 1) {
      if (fs.existsSync(fileFor(dir, n))) {
        fs.renameSync(fileFor(dir, n), fileFor(dir, n + 1));
      }
    }
    size = 0;
  };

  const write = (line) => {
    remember(line);
    if (!toFile) return;
    try {
      const bytes = Buffer.byteLength(line) + 1;
      if (size + bytes > maxBytes && size > 0) rotate();
      fs.appendFileSync(fileFor(dir, 0), `${line}\n`);
      size += bytes;
    } catch {
      toFile = false; // a failing disk must not break the app
    }
  };

  const limited = (lvl, args) => {
    const first = typeof args[0] === "string" ? args[0] : "";
    const key = `${lvl}:${first.slice(0, 60)}`;
    const t = now();
    let b = buckets.get(key);
    if (!b || t - b.start >= rate.windowMs) {
      if (b?.dropped) {
        write(
          formatLine(
            "warn",
            [`[${b.dropped} similar lines suppressed] ${key}`],
            redactOptions,
            now,
          ),
        );
      }
      b = { start: t, count: 0, dropped: 0 };
      buckets.set(key, b);
      if (buckets.size > 500) buckets.clear();
    }
    b.count += 1;
    if (b.count > rate.limit) {
      b.dropped += 1;
      return true;
    }
    return false;
  };

  const emit = (lvl, args) => {
    if (LEVELS[lvl] < threshold) return;
    if (limited(lvl, args)) return;
    write(formatLine(lvl, args, redactOptions, now));
    try {
      mirror?.(lvl, args);
    } catch {
      // The mirror is a convenience.
    }
  };

  return {
    debug: (...args) => emit("debug", args),
    info: (...args) => emit("info", args),
    warn: (...args) => emit("warn", args),
    error: (...args) => emit("error", args),
    /** Writes an already formatted, already redacted line. */
    raw: write,
    /** The last lines kept in memory (always on, even when the file works). */
    recent: () => [...memory],
    /** True when lines are going to disk, false when it fell back to memory. */
    writingToFile: () => toFile,
    redactOptions,
  };
}

// The shared instance. Until initLogging runs it keeps lines in memory, which
// initLogging then writes out, so nothing logged during startup is lost.
let current = createLogger();

export const log = {
  debug: (...a) => current.debug(...a),
  info: (...a) => current.info(...a),
  warn: (...a) => current.warn(...a),
  error: (...a) => current.error(...a),
};

/** Points the shared logger at a folder. Safe to call once, early. */
export function initLogging(options) {
  const early = current.recent();
  current = createLogger(options);
  // Already formatted and redacted: write them straight in.
  for (const line of early) current.raw(line);
  return current;
}

export const currentLogger = () => current;

/**
 * Routes console.log/info/warn/error/debug into the shared logger, so any
 * call site not yet moved to `log` is still redacted, rotated and kept. With
 * `mirror` the original console still prints (development).
 * @returns {() => void} Restores the original console.
 */
export function installConsole({ mirror = false } = {}) {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  const route = {
    log: "info",
    info: "info",
    warn: "warn",
    error: "error",
    debug: "debug",
  };
  for (const [method, lvl] of Object.entries(route)) {
    console[method] = (...args) => {
      current[lvl](...args);
      if (mirror) original[method].apply(console, args);
    };
  }
  return () => Object.assign(console, original);
}

const RENDERER_LEVELS = new Set(["warn", "error"]);
const MAX_RENDERER_ARGS = 6;
const MAX_RENDERER_BYTES = 4000;

/**
 * Logs a line sent from a window. The payload comes from the renderer, so it
 * is checked: only warn and error, a few arguments, a size limit.
 * @returns {boolean} whether it was accepted
 */
export function logFromRenderer(logger, payload) {
  if (!payload || typeof payload !== "object") return false;
  const { level, args } = payload;
  if (!RENDERER_LEVELS.has(level) || !Array.isArray(args)) return false;
  if (args.length === 0 || args.length > MAX_RENDERER_ARGS) return false;
  let bytes;
  try {
    bytes = JSON.stringify(args).length;
  } catch {
    return false;
  }
  if (bytes > MAX_RENDERER_BYTES) return false;
  const [first, ...rest] = args;
  logger[level](
    `[renderer] ${typeof first === "string" ? first : JSON.stringify(first)}`,
    ...rest,
  );
  return true;
}
