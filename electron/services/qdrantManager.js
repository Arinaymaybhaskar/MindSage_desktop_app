import { app } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import getPort from "get-port";
import { QdrantClient } from "@qdrant/js-client-rest";

let qdrantProc = null;

// Logs folder and daily rotation
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Retain logs for 7 days
const LOG_RETENTION_DAYS = 7;
function cleanOldLogs() {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    files.forEach(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        if (ageDays > LOG_RETENTION_DAYS) fs.unlinkSync(filePath);
    });
}
cleanOldLogs();

function getLogFilePath() {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(logsDir, `qdrant-${date}.log`);
}

function writeLog(msg) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(getLogFilePath(), `[${timestamp}] [qdrant] ${msg}\n`, { encoding: "utf8" });
}

function ensureExecutable(file) {
    if (process.platform !== "win32") {
        try {
            const stat = fs.statSync(file);
            if (!(stat.mode & 0o100)) fs.chmodSync(file, 0o755);
        } catch { }
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

async function waitForReady(url, timeoutMs = 15000) {
    const start = Date.now();
    while (true) {
        try {
            const res = await fetch(`${url}/collections`);
            if (res.ok) return;
        } catch { }
        if (Date.now() - start > timeoutMs) throw new Error("Qdrant did not become ready in time");
        await new Promise(r => setTimeout(r, 300));
    }
}

async function ensureCollection(baseUrl) {
    const client = new QdrantClient({ url: baseUrl });
    const collectionName = "mind_entries";

    try {
        await client.getCollection(collectionName);
        writeLog(`Collection '${collectionName}' already exists`);

        // Check if we need to update the collection schema
        const collectionInfo = await client.getCollection(collectionName);
        const currentVectorSize = collectionInfo.config.params.vectors.text_embedding.size;

        if (currentVectorSize !== 768) {
            writeLog(`Collection has ${currentVectorSize} dimensions, but nomic-embed-text:v1.5 produces 768. Updating collection...`);

            // Delete and recreate the collection with correct dimensions
            await client.deleteCollection(collectionName);
            await client.createCollection(collectionName, {
                vectors: {
                    text_embedding: { size: 768, distance: "Cosine" },
                },
                payload_schema: {
                    user_id: { type: "integer" },
                    source_type: { type: "keyword" },
                    source_id: { type: "integer" },
                    title: { type: "text" },
                    mood_score: { type: "float" },
                    sentiment_score: { type: "float" },
                    tags: { type: "keyword" },
                    category_name: { type: "text" },
                    status: { type: "keyword" },
                    target_date: { type: "datetime" },
                    goal_id: { type: "integer" },
                    goal_title: { type: "text" },
                    value_logged: { type: "float" },
                    unit: { type: "keyword" },
                    created_at: { type: "datetime" },
                },
            });
            writeLog(`Collection '${collectionName}' recreated with 768 dimensions`);
        }
    } catch (err) {
        if (err.status === 404 || err.response?.status === 404) {
            writeLog(`Creating collection '${collectionName}' with schema...`);
            await client.createCollection(collectionName, {
                vectors: {
                    text_embedding: { size: 768, distance: "Cosine" }, // Changed from 512 to 768
                },
                payload_schema: {
                    user_id: { type: "integer" },
                    source_type: { type: "keyword" },
                    source_id: { type: "integer" },
                    title: { type: "text" },
                    mood_score: { type: "float" },
                    sentiment_score: { type: "float" },
                    tags: { type: "keyword" },
                    category_name: { type: "text" },
                    status: { type: "keyword" },
                    target_date: { type: "datetime" },
                    goal_id: { type: "integer" },
                    goal_title: { type: "text" },
                    value_logged: { type: "float" },
                    unit: { type: "keyword" },
                    created_at: { type: "datetime" },
                },
            });
            writeLog(`Collection '${collectionName}' created with 768 dimensions`);
        } else {
            writeLog(`Failed to check collection: ${err}`, "error");
            throw err;
        }
    }
}

export async function startQdrant() {
    if (qdrantProc) {
        const httpPort = Number(process.env.QDRANT_HTTP_PORT);
        const dataDir = resolveDataDir();
        const baseUrl = `http://127.0.0.1:${httpPort}`;
        await ensureCollection(baseUrl);
        return { httpPort, grpcPort: httpPort + 1, baseUrl, dataDir };
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
    qdrantProc = spawn(bin, [], {
        env,
        cwd: path.dirname(bin),
        stdio: ["ignore", "pipe", "pipe"],
    });

    qdrantProc.stdout.on("data", (d) => writeLog(d.toString().trim()));
    qdrantProc.stderr.on("data", (d) => writeLog(d.toString().trim()));
    qdrantProc.on("close", (code) => {
        writeLog(`Qdrant exited with code ${code}`);
        qdrantProc = null;
    });

    const baseUrl = `http://127.0.0.1:${httpPort}`;
    await waitForReady(baseUrl);
    await ensureCollection(baseUrl);

    process.env.QDRANT_HTTP_PORT = String(httpPort);
    writeLog(`Qdrant running at ${baseUrl}, data dir: ${dataDir}`);

    return { httpPort, grpcPort, baseUrl, dataDir };
}

export function stopQdrant() {
    if (qdrantProc) {
        try { qdrantProc.kill(); } catch { }
        qdrantProc = null;
    }
}
