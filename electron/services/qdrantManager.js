import { app } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import getPort from "get-port";
import { QdrantClient } from "@qdrant/js-client-rest";

let qdrantProc = null;
// What the current process has done so far, kept on the module so a retry that
// finds it still running sees its failure at once and reports the ports it
// really got (KAN-338).
let procState = { spawnError: null, exitError: null, grpcPort: null };

// A Qdrant that accepts a connection and never answers must not hold startup
// forever (KAN-335): every request is bounded, and so is the whole start, so
// startServices always gets a result and the window can open without search.
const REQUEST_TIMEOUT_MS = 3000;
const START_DEADLINE_MS = 18000;

/** fetch that gives up after `ms`, using timers a test can fake. */
async function fetchWithTimeout(url, ms = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Rejects if `promise` has not settled within `ms`; the work is left to finish. */
function withDeadline(promise, ms, message) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  promise.catch(() => {}); // a late failure after the deadline is not unhandled
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// Retain logs for 7 days
const LOG_RETENTION_DAYS = 7;

// Resolve the logs folder lazily under userData. Using `process.cwd()/logs`
// (the previous behaviour) points at the read-only install dir in a packaged
// build, so the first log write throws.
let cleanedOldLogs = false;
function getLogsDir() {
  const logsDir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  if (!cleanedOldLogs) {
    cleanedOldLogs = true;
    cleanOldLogs(logsDir);
  }
  return logsDir;
}

function cleanOldLogs(logsDir) {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    files.forEach((file) => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > LOG_RETENTION_DAYS) fs.unlinkSync(filePath);
    });
  } catch {
    // Non-fatal.
  }
}

function getLogFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(getLogsDir(), `qdrant-${date}.log`);
}

function writeLog(msg) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(getLogFilePath(), `[${timestamp}] [qdrant] ${msg}\n`, {
      encoding: "utf8",
    });
  } catch {
    // Swallow logging errors.
  }
}

function ensureExecutable(file) {
  if (process.platform !== "win32") {
    try {
      const stat = fs.statSync(file);
      if (!(stat.mode & 0o100)) fs.chmodSync(file, 0o755);
    } catch {}
  }
}

function resolveBinaryPath() {
  const binName = process.platform === "win32" ? "qdrant.exe" : "qdrant";
  const platformDir =
    process.platform === "win32"
      ? "win"
      : process.platform === "darwin"
        ? "mac"
        : "linux";

  const base = app.isPackaged
    ? path.join(process.resourcesPath, platformDir)
    : path.join(app.getAppPath(), "resources", platformDir);

  const binPath = path.join(base, binName);
  ensureExecutable(binPath);
  return binPath;
}

function resolveDataDir() {
  return path.join(app.getPath("userData"), "qdrant-data");
}

// `failure` returns the error that ended the process, if it has ended, so a
// Qdrant that cannot start fails here at once instead of after the timeout.
async function waitForReady(url, timeoutMs = 15000, failure = () => null) {
  const start = Date.now();
  while (true) {
    const failed = failure();
    if (failed) throw failed;
    try {
      const res = await fetchWithTimeout(`${url}/collections`);
      if (res.ok) return;
    } catch {}
    if (Date.now() - start > timeoutMs)
      throw new Error("Qdrant did not become ready in time");
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function ensureCollection(baseUrl) {
  const client = new QdrantClient({ url: baseUrl, timeout: 5000 });
  const collectionName = "mind_entries";

  try {
    await client.getCollection(collectionName);
    writeLog(`Collection '${collectionName}' already exists`);

    // Check if we need to update the collection schema
    const collectionInfo = await client.getCollection(collectionName);
    const currentVectorSize =
      collectionInfo.config.params.vectors.text_embedding.size;

    if (currentVectorSize !== 768) {
      writeLog(
        `Collection has ${currentVectorSize} dimensions, but nomic-embed-text:v1.5 produces 768. Updating collection...`,
      );

      // Delete and recreate the collection with correct dimensions
      await client.deleteCollection(collectionName);
      await client.createCollection(collectionName, {
        vectors: {
          text_embedding: { size: 768, distance: "Cosine" },
        },
        payload_schema: {
          // Common fields
          user_id: { type: "integer" },
          source_type: { type: "keyword" }, // 'journal', 'goal', 'progress_log'
          source_id: { type: "integer" },
          title: { type: "text" },
          created_at: { type: "datetime" },

          // Journal-specific fields
          content: { type: "text" },
          mood_score: { type: "float" },
          mood_tags: { type: "keyword" },
          category_name: { type: "text" },
          updated_at: { type: "datetime" },

          // Goal-specific fields
          description: { type: "text" },
          parent_goal_title: { type: "text" },
          current_value: { type: "float" },
          target_value: { type: "float" },
          unit: { type: "keyword" },
          status: { type: "keyword" }, // 'active', 'completed', 'paused'
          is_pinned: { type: "integer" },
          target_date: { type: "datetime" },
          completed_date: { type: "datetime" },

          // Progress log-specific fields
          goal_id: { type: "integer" },
          goal_title: { type: "text" },
          value_logged: { type: "float" },

          // Legacy fields (keep for backward compatibility)
          sentiment_score: { type: "float" },
          tags: { type: "keyword" },
        },
      });
      writeLog(
        `Collection '${collectionName}' recreated with 768 dimensions and enhanced schema`,
      );
    } else {
      // Check if schema needs updating for new fields
      try {
        // Try to create index for new fields if they don't exist
        await client.createFieldIndex(collectionName, "source_type", {
          field_name: "source_type",
          field_schema: { type: "keyword" },
        });
        await client.createFieldIndex(collectionName, "goal_id", {
          field_name: "goal_id",
          field_schema: { type: "integer" },
        });
        await client.createFieldIndex(collectionName, "status", {
          field_name: "status",
          field_schema: { type: "keyword" },
        });
        writeLog(
          `Updated collection '${collectionName}' with new field indexes`,
        );
      } catch (indexError) {
        // Indexes might already exist, that's fine
        writeLog(`Collection '${collectionName}' schema is up to date`);
      }
    }
  } catch (err) {
    if (err.status === 404 || err.response?.status === 404) {
      writeLog(
        `Creating collection '${collectionName}' with enhanced schema...`,
      );
      await client.createCollection(collectionName, {
        vectors: {
          text_embedding: { size: 768, distance: "Cosine" },
        },
        payload_schema: {
          // Common fields
          user_id: { type: "integer" },
          source_type: { type: "keyword" }, // 'journal', 'goal', 'progress_log'
          source_id: { type: "integer" },
          title: { type: "text" },
          created_at: { type: "datetime" },

          // Journal-specific fields
          content: { type: "text" },
          mood_score: { type: "float" },
          mood_tags: { type: "keyword" },
          category_name: { type: "text" },
          updated_at: { type: "datetime" },

          // Goal-specific fields
          description: { type: "text" },
          parent_goal_title: { type: "text" },
          current_value: { type: "float" },
          target_value: { type: "float" },
          unit: { type: "keyword" },
          status: { type: "keyword" }, // 'active', 'completed', 'paused'
          is_pinned: { type: "integer" },
          target_date: { type: "datetime" },
          completed_date: { type: "datetime" },

          // Progress log-specific fields
          goal_id: { type: "integer" },
          goal_title: { type: "text" },
          value_logged: { type: "float" },

          // Legacy fields (keep for backward compatibility)
          sentiment_score: { type: "float" },
          tags: { type: "keyword" },
        },
      });
      writeLog(
        `Collection '${collectionName}' created with 768 dimensions and enhanced schema`,
      );
    } else {
      writeLog(`Failed to check collection: ${err}`, "error");
      throw err;
    }
  }
}

export function startQdrant() {
  return withDeadline(
    startQdrantUnbounded(),
    START_DEADLINE_MS,
    "Qdrant did not finish starting in time",
  );
}

async function startQdrantUnbounded() {
  if (qdrantProc) {
    // Also the path a retry takes when the first start timed out on a slow
    // Qdrant that is still coming up, so wait for it rather than assume it.
    const httpPort = Number(process.env.QDRANT_HTTP_PORT);
    const dataDir = resolveDataDir();
    const baseUrl = `http://127.0.0.1:${httpPort}`;
    await waitForReady(
      baseUrl,
      undefined,
      () => procState.spawnError || procState.exitError,
    );
    await ensureCollection(baseUrl);
    console.log(`[QDRANT] Already running at ${baseUrl}`);
    return {
      httpPort,
      grpcPort: procState.grpcPort ?? httpPort + 1,
      baseUrl,
      dataDir,
    };
  }

  const httpPort = await getPort({ port: 6333 });
  const grpcPort = await getPort({ port: httpPort + 1 });
  const dataDir = resolveDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const env = {
    ...process.env,
    QDRANT__STORAGE__STORAGE_PATH: dataDir,
    QDRANT__SERVICE__HTTP_PORT: String(httpPort),
    QDRANT__SERVICE__GRPC_PORT: String(grpcPort),
    QDRANT__SERVICE__HOST: "127.0.0.1",
  };

  const bin = resolveBinaryPath();
  const proc = spawn(bin, [], {
    env,
    cwd: path.dirname(bin),
    stdio: ["ignore", "pipe", "pipe"],
  });
  qdrantProc = proc;
  procState = { spawnError: null, exitError: null, grpcPort };
  // Set as soon as the port is chosen so a later retry can find this process.
  process.env.QDRANT_HTTP_PORT = String(httpPort);

  // Without an 'error' listener a binary that cannot be spawned (missing,
  // quarantined by antivirus, not executable) is an uncaught exception in the
  // main process. Record it so startup can fail cleanly and fall back to
  // running without search.
  const state = procState;
  proc.on("error", (err) => {
    state.spawnError = err;
    writeLog(`Qdrant could not be started: ${err.message}`);
    if (qdrantProc === proc) qdrantProc = null;
  });

  proc.stdout.on("data", (d) => writeLog(d.toString().trim()));
  proc.stderr.on("data", (d) => writeLog(d.toString().trim()));
  proc.on("close", (code) => {
    writeLog(`Qdrant exited with code ${code}`);
    state.exitError ??= new Error(
      `Qdrant exited with code ${code} before it was ready`,
    );
    if (qdrantProc === proc) qdrantProc = null;
  });

  const baseUrl = `http://127.0.0.1:${httpPort}`;
  await waitForReady(
    baseUrl,
    undefined,
    () => state.spawnError || state.exitError,
  );
  await ensureCollection(baseUrl);

  writeLog(`Qdrant running at ${baseUrl}, data dir: ${dataDir}`);
  console.log(`[QDRANT] Ready and running at ${baseUrl}`);
  return { httpPort, grpcPort, baseUrl, dataDir };
}

export function stopQdrant() {
  if (qdrantProc) {
    try {
      qdrantProc.kill();
    } catch {}
    qdrantProc = null;
  }
}
