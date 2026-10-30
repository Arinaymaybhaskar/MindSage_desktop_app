// Launch the real app for QA (same recipe as scripts/e2e/run.mjs) and drive it.
// Needs `npx vite build` first, and a display: `xvfb-run -a node your-script.mjs` (Linux only).
// As root set E2E_NO_SANDBOX=1 (or pass noSandbox: true).
import { _electron as electron } from "playwright-core";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
// The electron package exports its binary path (electron.exe on Windows);
// node_modules/.bin/electron is a shell shim there. Resolve from `root` so a
// worktree uses its own install.
const electronBin = (root) =>
  createRequire(path.join(root, "package.json"))("electron");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @returns {{app, page, root, profileDir}} once the app says it is ready */
export async function launchApp({
  profileDir,
  env = {},
  path: root = defaultRoot,
  noSandbox = process.env.E2E_NO_SANDBOX === "1",
}) {
  const app = await electron.launch({
    executablePath: electronBin(root),
    args: [root, ...(noSandbox ? ["--no-sandbox"] : [])],
    env: { ...process.env, ...env, MS_USER_DATA_DIR: profileDir },
  });
  let page;
  for (
    const end = Date.now() + 60_000;
    !page && Date.now() < end;
    await sleep(200)
  )
    page = app
      .windows()
      .find(
        (w) =>
          w.url().includes("index.html") && !w.url().includes("quick-capture"),
      );
  if (!page) throw new Error("the main window never appeared");
  await page.waitForFunction(
    () => document.body.dataset.appReady === "true",
    null,
    {
      timeout: 180_000,
    },
  );
  return { app, page, root, profileDir };
}

// sign-up blocks passwords zxcvbn scores under 3; keep this one long and odd.
export const QA_PASSWORD = "correct-horse-battery-staple-9!";

/**
 * Sign-up on a fresh install, as a person does it: welcome, "Get started", one
 * screen (profile name plus password). Ends on the profile picker with the new
 * profile selected; signIn follows.
 */
export async function signUp(page, { username, password = QA_PASSWORD }) {
  await page.getByText("Welcome to MindSage").waitFor();
  await page.getByText("Get started").click();
  await page.locator("#username").fill(username);
  await page.getByText("This name is free.").waitFor({ timeout: 15_000 });
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Create profile" }).click();
  await page.waitForFunction(
    () => location.hash.startsWith("#/profiles"),
    null,
    { timeout: 30_000 },
  );
}

/**
 * Signs in. A new profile's first sign-in lands on Local AI setup, then
 * You're set (KAN-470): skip the one, start from the other, so the dock is up
 * when this returns.
 */
export async function signIn(page, password = QA_PASSWORD) {
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const skip = page.getByRole("button", { name: "Skip for now" });
  const dock = page.getByTestId("dock");
  await skip.or(dock).waitFor({ timeout: 30_000 });
  if (await skip.isVisible()) {
    await skip.click();
    await page.getByRole("button", { name: "Start writing" }).click();
  }
  await dock.waitFor({ timeout: 30_000 });
}

/** Saves an entry through the UI; returns its id. */
export async function writeEntry(page, { title, body }) {
  await page.evaluate(() => (location.hash = "#/"));
  await page.getByTestId("journal-title-input").fill(title);
  await page.getByTestId("journal-body-input").fill(body);
  await page.getByTestId("journal-save").click();
  const find = (t) =>
    window.electron.ipcRenderer
      .invoke("journal:get-recent")
      .then((r) =>
        Array.isArray(r) ? r.find((e) => e.title === t) : undefined,
      );
  const handle = await page.waitForFunction(find, title, { timeout: 30_000 });
  return (await handle.jsonValue()).id;
}

/** Rows of a read-only query against <profileDir>/mind-sage.db (plain JSON). */
export function dbRows(root, profileDir, sql) {
  const out = execFileSync(
    electronBin(root),
    [
      path.join(root, "scripts/qa/db.cjs"),
      path.join(profileDir, "mind-sage.db"),
      sql,
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8" },
  );
  return JSON.parse(out);
}

/** Polls search_index until the journal entry is 'ok'; throws on 'failed' or timeout. */
export async function waitIndexed({
  root,
  profileDir,
  entryId,
  timeout = 60_000,
}) {
  const sql = `SELECT state, last_error FROM search_index WHERE source_type='journal' AND source_id=${Number(entryId)}`;
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(500)) {
    const [row] = dbRows(root, profileDir, sql);
    if (row?.state === "ok") return;
    if (row?.state === "failed")
      throw new Error(`index failed: ${row.last_error}`);
  }
  throw new Error(`entry ${entryId} not indexed within ${timeout} ms`);
}

/** Closes the app; returns the ms it took, or 'hung' (then SIGKILLs its own pid). */
export async function timeClose(app, ms = 15_000) {
  const t0 = Date.now();
  const hung = Symbol();
  const r = await Promise.race([
    app.close().then(() => 0),
    sleep(ms).then(() => hung),
  ]);
  if (r !== hung) return Date.now() - t0;
  app.process().kill("SIGKILL");
  return "hung";
}
