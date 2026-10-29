// One end-to-end run of the real app: launch, sign up, sign in, write an entry,
// wait for the AI to finish with it, find it through search.
//
//   npm run test:e2e          # builds, then runs this
//
// Needs, for the AI and search steps (all of them in CI, see ci.yml):
//   - Ollama running with the embedding model (nomic-embed-text:v1.5) and a
//     small chat model named in E2E_CHAT_MODEL (default llama3.2:1b)
// E2E_SKIP_AI=1 stops after the entry is saved and says so loudly: it proves
// launch, sign-up, sign-in and writing, and nothing about AI or search.
//
// Waits are on the app's own signals (services-ready, the aiCompleted event,
// the index-completed event), never on a fixed sleep.

import { _electron as electron } from "playwright-core";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const artifacts = path.join(root, "e2e-artifacts");
const skipAi = process.env.E2E_SKIP_AI === "1";
const chatModel = process.env.E2E_CHAT_MODEL || "llama3.2:1b";

const run = Math.random().toString(36).slice(2, 8);
const username = `e2e_${run}`;
const password = "correct-horse-battery-staple-9!";
// A word no other entry will contain, so search finding it means it found this.
const marker = `marmalade${run}`;
const entryTitle = `Morning walk ${marker}`;
const entryBody = `I walked by the river this morning and felt calm and grateful. The ${marker} on the toast was the best part of a slow, quiet breakfast.`;

const log = (msg) =>
  console.log(`[e2e ${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const t0 = Date.now();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mindsage-e2e-"));

let app;
let page;

async function mainWindow(timeout = 60_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    for (const w of app.windows()) {
      const url = w.url();
      if (url.includes("index.html") && !url.includes("quick-capture"))
        return w;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the main window never appeared");
}

const invoke = (channel, ...args) =>
  page.evaluate(
    ([c, a]) => window.electron.ipcRenderer.invoke(c, ...a),
    [channel, args],
  );

async function step(name, fn) {
  log(`> ${name}`);
  await fn();
  log(`  ok: ${name}`);
}

async function main() {
  await step("launch", async () => {
    app = await electron.launch({
      executablePath: require("electron"),
      args: [
        root,
        ...(process.env.E2E_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
      ],
      env: { ...process.env, MS_USER_DATA_DIR: profile },
    });
    page = await mainWindow();
    page.on("pageerror", (e) => log(`  renderer error: ${e.message}`));
    // services-ready is sent whether or not the vector index started.
    await page.waitForFunction(
      () => document.body.dataset.appReady === "true",
      null,
      {
        timeout: 180_000,
      },
    );
  });

  await step("skip first-run AI setup, open sign-up", async () => {
    await page.evaluate(() => {
      localStorage.setItem("setup_complete", "1"); // what "Skip for now" does
      location.hash = "#/profiles";
    });
    // A fresh install has no profiles: the picker shows the welcome.
    await page.getByText("Welcome to MindSage").waitFor();
    await page.getByText("Get started").click();
    await page.getByText("Create your profile").waitFor();
  });

  await step("sign up", async () => {
    await page.locator("#username").fill(username);
    await page.getByText("This name is free.").waitFor({ timeout: 15_000 });
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Create profile" }).click();
    await page.waitForFunction(
      () => location.hash.startsWith("#/profiles"),
      null,
      { timeout: 30_000 },
    );
  });

  await step("sign in", async () => {
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByTestId("dock").waitFor({ timeout: 30_000 });
  });

  if (!skipAi) {
    await step(`use the small chat model (${chatModel})`, async () => {
      await invoke("models:save-selected", { chat: chatModel });
    });
  }

  // Listen before saving, so the events cannot be missed.
  await page.evaluate(() => {
    window.__e2e = { aiCompleted: [], aiFailed: [], index: [] };
    window.electron.onAICompleted((d) => window.__e2e.aiCompleted.push(d));
    window.electron.ipcRenderer.on("ai-status-event", (p) => {
      if (p?.event === "journal:aiFailed") window.__e2e.aiFailed.push(p.data);
      if (/^journal:index(Completed|Failed)$/.test(p?.event ?? ""))
        window.__e2e.index.push(p);
    });
  });

  let entryId;
  await step("write an entry", async () => {
    await page.evaluate(() => (location.hash = "#/"));
    await page.getByTestId("journal-title-input").fill(entryTitle);
    await page.getByTestId("journal-body-input").fill(entryBody);
    await page.getByTestId("journal-save").click();
    // The entry exists as soon as the save lands, whatever the AI does next.
    await page.waitForFunction(
      async (title) => {
        const recent =
          await window.electron.ipcRenderer.invoke("journal:get-recent");
        return Array.isArray(recent) && recent.some((e) => e.title === title);
      },
      entryTitle,
      { timeout: 30_000 },
    );
    const recent = await invoke("journal:get-recent");
    entryId = recent.find((e) => e.title === entryTitle).id;
    if (!entryId) throw new Error("saved entry has no id");
  });

  await step(
    "the log is written and holds none of the entry's text",
    async () => {
      // A renderer error goes through the one log channel (KAN-170)...
      await page.evaluate(() => console.error("e2e renderer log check"));
      const file = path.join(profile, "logs", "mindsage.log");
      const read = () =>
        fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      const deadline = Date.now() + 10_000;
      while (!read().includes("e2e renderer log check")) {
        if (Date.now() > deadline)
          throw new Error("renderer log line never reached the log file");
        await new Promise((r) => setTimeout(r, 200));
      }
      // ...and nothing in any log file quotes what was written.
      const everything = fs
        .readdirSync(path.join(profile, "logs"))
        .map((f) => fs.readFileSync(path.join(profile, "logs", f), "utf8"))
        .join("\n");
      for (const secret of [entryTitle, entryBody, marker]) {
        if (everything.includes(secret)) {
          throw new Error(
            `a log file contains the entry text: ${secret.slice(0, 30)}`,
          );
        }
      }
    },
  );

  if (skipAi) {
    log("E2E_SKIP_AI=1: AI metadata, indexing and search were NOT exercised.");
    return;
  }

  await step("wait for the AI to finish with it", async () => {
    await page.waitForFunction(
      (id) => {
        const e = window.__e2e;
        if (e.aiFailed.some((f) => String(f.entryId) === String(id))) {
          throw new Error(`AI metadata failed: ${JSON.stringify(e.aiFailed)}`);
        }
        const failedIndex = e.index.find(
          (p) => p.event === "journal:indexFailed",
        );
        if (failedIndex)
          throw new Error(`indexing failed: ${JSON.stringify(failedIndex)}`);
        const done = e.aiCompleted.some(
          (d) => String(d.entryId) === String(id),
        );
        const indexed = e.index.some(
          (p) =>
            p.event === "journal:indexCompleted" &&
            String(p.data?.entryId) === String(id),
        );
        return done && indexed;
      },
      entryId,
      { timeout: 600_000, polling: 500 },
    );
    const entry = await invoke("journal:get-by-id", entryId);
    if (entry.ai_metadata_status !== "completed") {
      throw new Error(`ai_metadata_status is ${entry.ai_metadata_status}`);
    }
  });

  await step("find the entry through search", async () => {
    await page.keyboard.press("Control+f");
    const input = page.getByTestId("global-search-input");
    // Semantic search drops weak matches (score under 0.5), so one rare word
    // is not a safe query; the entry's own sentence is. The marker still makes
    // it unmistakable which entry was found.
    await input.fill(entryBody);
    await page
      .locator('[data-testid^="search-result-"]', { hasText: marker })
      .first()
      .waitFor({ timeout: 60_000 });
  });
}

let failed = false;
try {
  await main();
} catch (err) {
  failed = true;
  log(`FAILED: ${err?.stack || err}`);
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    await page?.screenshot({ path: path.join(artifacts, "failure.png") });
    log(`screenshot: ${path.join(artifacts, "failure.png")}`);
  } catch {}
} finally {
  await app?.close().catch(() => {});
  if (process.env.E2E_KEEP_PROFILE === "1") log(`profile kept at ${profile}`);
  else fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
