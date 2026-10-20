// Proof the QA kit works: fake Ollama + real app + scan. `npm run qa:smoke`
// (build first: npx vite build; as root: E2E_NO_SANDBOX=1).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchApp,
  signUp,
  signIn,
  writeEntry,
  waitIndexed,
  timeClose,
} from "./app.mjs";
import { scanDir } from "./scan.mjs";
import {
  startTracked,
  stopTracked,
  waitForPort,
  baseline,
  newOrphans,
} from "./procs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qa-smoke-"));
const profileDir = path.join(tmp, "profile");
const pidfile = path.join(tmp, "fake-ollama.pid");
const word = `quokka${Math.random().toString(36).slice(2, 8)}`;
const base = baseline(/electron/i);
let verdict = "FAIL";
let detail = "";

try {
  const port = 11434;
  startTracked(
    "node",
    [
      path.join(here, "fake-ollama.mjs"),
      "--port",
      String(port),
      "--log",
      path.join(tmp, "requests.jsonl"),
    ],
    pidfile,
  );
  if (!(await waitForPort(port, 5000)))
    throw new Error(
      `fake ollama not up: ${fs.readFileSync(`${pidfile}.log`, "utf8").trim()}`,
    );
  const { app, page } = await launchApp({ profileDir });
  await signUp(page, {
    username: "qa_smoke",
    password: "correct-horse-battery-9!",
  });
  await signIn(page, "correct-horse-battery-9!");
  const entryId = await writeEntry(page, {
    title: `Smoke ${word}`,
    body: `The ${word} sat by the river this calm morning.`,
  });
  await waitIndexed({ root, profileDir, entryId });
  const closeMs = await timeClose(app);
  const hits = scanDir(profileDir, [word]);
  const files = hits.map((h) => h.file);
  const orphans = newOrphans(base, /electron/i).length;
  detail = `entry=${entryId} close=${closeMs}ms orphans=${orphans} hits=${files.join(",") || "none"}`;
  if (closeMs === "hung") throw new Error("close hung");
  if (files.length !== 1 || files[0] !== "mind-sage.db")
    throw new Error(`word found in unexpected files; ${detail}`);
  verdict = "PASS";
} catch (err) {
  detail ||= String(err?.message ?? err);
  if (!detail.includes(String(err?.message))) detail += ` | ${err?.message}`;
} finally {
  await stopTracked(pidfile);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${verdict} qa-smoke ${detail}`);
  process.exit(verdict === "PASS" ? 0 : 1);
}
