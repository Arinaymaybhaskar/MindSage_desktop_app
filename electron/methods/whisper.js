import { spawn } from "child_process";
import { app } from "electron";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { eventBus } from "../eventBus";
import fs from "fs";

let liveProcess = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ADDED: Regex to test for the presence of text in brackets.
const bracketTestRegex = /\[.*?\]/;

function safeSend(event, channel, payload) {
    try {
        event?.sender?.send(channel, payload);
    } catch (err) {
        console.warn(`Failed to send IPC to ${channel}:`, err);
    }
}

export function startLiveTranscription(event) {
    if (liveProcess) {
        console.warn("⚠️ Live transcription already running, skipping start");
        return;
    }

    const isDev = !app.isPackaged;

    const basePath = isDev
        ? path.join(__dirname, "..", "resources", "whisper-bin-x64") // dev
        : path.join(process.resourcesPath, "whisper-bin-x64");      // packaged

    const exePath = path.join(basePath, "Release", "whisper-stream.exe");
    const modelPath = path.join(basePath, "models", "ggml-tiny.en.bin");

    console.log("🚀 Starting live transcription...");

    liveProcess = spawn(exePath, ["--model", modelPath, "--capture", "-1"]);

    console.log("✅ Spawned whisper-stream.exe with PID:", liveProcess.pid);

    liveProcess.stdout.on("data", (data) => {
        const msg = data.toString();

        // NEW LOGIC: Test if the message contains bracketed text.
        // If it does, discard the entire chunk and do nothing.
        if (bracketTestRegex.test(msg)) {
            console.log("🚫 Skipping chunk with bracketed text:", msg.trim());
            return; // Exit the function, effectively ignoring the chunk.
        }

        // Only send the message if it's not empty.
        // This handles any other empty/whitespace-only outputs.
        if (msg.trim()) {
            console.log("📥 [Whisper STDOUT]:", msg.trim());
            const resultObject = { text: msg };
            event.sender.send("live-transcription-data", resultObject);
        }
    });

    liveProcess.stderr.on("data", (err) => {
        console.error("❌ [Whisper STDERR]:", err.toString().trim());
    });

    liveProcess.on("close", (code, signal) => {
        console.log(`🛑 Whisper live closed (code=${code}, signal=${signal})`);
        liveProcess = null;
        event.sender.send("live-transcription-stopped");
    });
}

export function stopLiveTranscription() {
    if (liveProcess) {
        console.log("🛑 Stopping live transcription (PID:", liveProcess.pid, ")");
        liveProcess.kill("SIGINT");
        liveProcess = null;
    } else {
        console.warn("⚠️ stopLiveTranscription called but no process is running");
    }
}

// -------------------
// For blob transcription
// -------------------
export function transcribeAudioBlob(filePath, event) {
    return new Promise((resolve, reject) => {
        const isDev = !app.isPackaged;

        const basePath = isDev
            ? path.join(__dirname, "..", "resources", "whisper-bin-x64") // dev
            : path.join(process.resourcesPath, "whisper-bin-x64");      // packaged

        const exePath = path.join(basePath, "Release", "whisper-cli.exe");
        const modelPath = path.join(basePath, "models", "ggml-tiny.en.bin");

        console.log("🚀 Starting blob transcription...");

        const whisperProcess = spawn(exePath, [
            "--model", modelPath,
            "--file", filePath,
            "--output-json"
        ]);

        let output = "";
        let error = "";

        whisperProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        whisperProcess.stderr.on("data", (data) => {
            error += data.toString();
        });

        whisperProcess.on("close", (code) => {
            const jsonPath = `${filePath}.json`;
            if (fs.existsSync(jsonPath)) {
                try {
                    const json = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

                    // Filter bracketed text
                    if (json.transcription && Array.isArray(json.transcription)) {
                        json.transcription = json.transcription.filter(
                            (seg) => seg.text && !bracketTestRegex.test(seg.text)
                        );
                    }

                    console.log("✅ Transcription JSON:", json);
                    resolve(json);
                    safeSend(event, "blob-transcription-result", json);
                } catch (err) {
                    console.error("JSON parse error:", err);
                    reject(err);
                }
            } else {
                console.error("Whisper JSON file not found:", jsonPath);
                reject(new Error("Whisper JSON file missing"));
            }
        });
    });
}


// Assumes you have access to the eventBus instance.
// Also assumes the event that triggers this passes the original IPC 'event' object.
eventBus.on("journal:audio-saved", ({ entry, event }) => {
    if (!entry.audio_key || !event) {
        if (!entry.audio_key) console.error("Audio key missing from 'journal:audio-saved' event.");
        if (!event) console.error("IPC event object missing from 'journal:audio-saved' event.");
        return;
    }

    eventBus.emit("whisper:transcribe-started", { audioKey: entry.audio_key, event });

    console.log(`🚀 Kicking off transcription for: ${entry.audio_key}`);

    transcribeAudioBlob(entry.audio_key, event)
        .then(transcriptionJson => {
            console.log("✅ Successfully processed transcription for:", entry.audio_key);

            // Extract plain text
            const transcriptionText = transcriptionJson.transcription
                .map(seg => seg.text)
                .join(" ")
                .replace(/\[.*?\]/g, "") // remove bracketed notes if you want
                .trim();
            console.log("📝 Transcription text:", transcriptionText);
            eventBus.emit("whisper:transcribe-ended", { entry, transcriptionText });
            // Save to DB
            // localDB.db.prepare(`
            //     UPDATE journals
            //     SET transcription = ?, updated_at = CURRENT_TIMESTAMP
            //     WHERE id = ?
            // `).run(transcriptionText, entry.id);

            // console.log(`📝 Transcription saved to DB for journal ${entry.id}`);
        })
        .catch(error => {
            console.error("💥 Transcription failed for:", entry.audio_key, error);

            event.sender.send("blob-transcription-error", {
                message: "Transcription failed.",
                error: error.message
            });
        });
});
