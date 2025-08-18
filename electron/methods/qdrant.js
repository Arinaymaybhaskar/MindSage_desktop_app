// qdrantManager.js
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import http from "http";
import jwt from "jsonwebtoken";

let qdrantProcess = null;
let qdrantPort = 6333;

function getUserIdFromToken(token) {
    try {
        // 1. Guard against null or undefined tokens
        if (!token) {
            return null;
        }
        const decoded = jwt.decode(token);
        // 2. Ensure the token was successfully decoded and has an id
        console.log(decoded, "decoded");
        return decoded.id;
    } catch (e) {
        console.error("Error decoding token:", e);
        return null;
    }
}

function getQdrantPath() {
    const isDev = process.env.NODE_ENV === "development";
    const qdrantBinaryDir = isDev
        ? path.join(__dirname, "qdrant_bin")
        : path.join(process.resourcesPath, "qdrant");

    const qdrantBinaryName =
        process.platform === "darwin"
            ? process.arch === "arm64"
                ? "qdrant-aarch64-apple-darwin"
                : "qdrant-x86_64-apple-darwin"
            : process.platform === "win32"
                ? "qdrant.exe"
                : "qdrant-x86_64-unknown-linux-gnu";

    return path.join(qdrantBinaryDir, qdrantBinaryName);
}

function getAvailablePort(startPort, callback) {
    const server = http.createServer();
    server.listen(startPort, () => {
        server.close(() => callback(startPort));
    });
    server.on("error", () => {
        getAvailablePort(startPort + 1, callback);
    });
}

function startQdrant(token, authMode) {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    }
    return new Promise((resolve, reject) => {
        if (qdrantProcess) return resolve({ port: qdrantPort });

        getAvailablePort(qdrantPort, (port) => {
            qdrantPort = port;
            const qdrantPath = path.join(
                process.resourcesPath,
                "qdrant", // folder where binary will be stored in packaged app
                process.platform === "darwin"
                    ? process.arch === "arm64"
                        ? "qdrant-aarch64-apple-darwin"
                        : "qdrant-x86_64-apple-darwin"
                    : process.platform === "win32"
                        ? "qdrant.exe"
                        : "qdrant-x86_64-unknown-linux-gnu"
            );

            if (!fs.existsSync(qdrantPath)) {
                return reject(new Error("Qdrant binary not found"));
            }

            qdrantProcess = spawn(qdrantPath, ["--storage", path.join(process.cwd(), "qdrant_data"), "--port", port], {
                cwd: path.dirname(qdrantPath),
            });

            qdrantProcess.stdout.on("data", (data) => {
                console.log(`Qdrant: ${data}`);
            });

            qdrantProcess.stderr.on("data", (data) => {
                console.error(`Qdrant Error: ${data}`);
            });

            setTimeout(() => resolve({ port }), 3000); // Wait for server to start
        });
    });
}

function stopQdrant(token, authMode) {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    }
    if (qdrantProcess) {
        qdrantProcess.kill();
        qdrantProcess = null;
    }
}

async function createCollection(token, authMode, name) {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    }
    const res = await fetch(`http://localhost:${qdrantPort}/collections/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            vectors: { size: 1536, distance: "Cosine" },
        }),
    });
    return res.json();
}

async function insertVector(token, authMode, collection, id, vector, payload = {}) {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    }
    const res = await fetch(`http://localhost:${qdrantPort}/collections/${collection}/points`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            points: [{ id, vector, payload }],
        }),
    });
    return res.json();
}

async function searchVector(token, authMode, collection, vector, limit = 5) {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    }
    const res = await fetch(`http://localhost:${qdrantPort}/collections/${collection}/points/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector, limit }),
    });
    return res.json();
}

module.exports = {
    startQdrant,
    stopQdrant,
    createCollection,
    insertVector,
    searchVector,
};
