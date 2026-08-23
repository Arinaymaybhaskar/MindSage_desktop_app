/**
 * Captures the marketing screenshot set from the running app.
 *
 *   npm run dev:capture          # terminal 1 - app with a CDP port open
 *   npm run capture              # terminal 2 - this
 *   npm run capture -- dashboard journals    # or just some shots
 *
 * Output lands in public/screenshots/v2/ at 2x. The pixel density comes from
 * CDP's deviceScaleFactor override rather than the physical display, so these
 * are genuinely crisp even on a 1x monitor - which no OS screenshot tool can do.
 *
 * Prerequisites:
 *   - npm run seed:demo -- --reset      (otherwise you photograph an empty app)
 *   - logged in as the demo user
 *   - Ollama running, for the search/chat/ghost-text shots
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { attach } from "./lib/cdp.mjs";
import { PRESETS, PRESET_NAMES } from "./lib/themes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(here, "..", "public", "screenshots", "v2");

/** 1600x1000 at 2x -> 3200x2000. Comfortably clears the 1280px max-w-7xl layout. */
const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 2 };

/**
 * Settle time before a capture. framer-motion entrance animations and the GSAP
 * masonry stagger both run on mount; capturing early catches cards mid-flight
 * at partial opacity, which is what makes the existing screenshot set look
 * accidental.
 */
const SETTLE = 1200;

/**
 * Accent preset for the whole set. The demo user's settings default to
 * "Default", whose accents are near-grey - which is how the previous
 * screenshot set ended up showing none of the app's colour system at all.
 * Override with:  npm run capture -- --theme Ocean
 */
const DEFAULT_THEME = "Sunset";

/** The seeded demo account. Must match PERSONA in scripts/seed-demo.mjs. */
const DEMO_LOGIN = { identifier: "maya@mindsage.local", password: "demo1234" };

/**
 * Logs into the demo account unless already there.
 *
 * Without this the run photographs whichever account happens to be logged in -
 * which silently produces a technically perfect screenshot of the wrong data.
 * Goes through the real auth:login IPC and then writes the same three
 * localStorage keys AuthContext does (AuthContext.tsx:38-48), so the app is in
 * exactly the state a normal login leaves it in.
 */
async function ensureDemoUser(cdp) {
  const current = await cdp.evaluate(`(() => {
    try { return JSON.parse(localStorage.getItem('userInfo') || 'null'); }
    catch { return null; }
  })()`);

  const alreadyDemo = current?.email === DEMO_LOGIN.identifier;
  if (!alreadyDemo) {
    console.log(
      `  Logged in as ${current?.username ?? "nobody"} - switching to the demo account`
    );
  }

  // Log in again even when already on the demo account. The dashboard reads
  // profile_picture from the cached localStorage userInfo (dashBoard.tsx:361),
  // not from the database, so a copy cached before the seeder attached an
  // avatar silently renders the fallback initial instead of the picture.

  const result = await cdp.evaluate(`(async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke(
        "auth:login", "offline", ${JSON.stringify(DEMO_LOGIN)}
      );
      if (!res?.accessToken) return { ok: false, error: "no token returned" };
      localStorage.setItem("authMode", "offline");
      localStorage.setItem("accessToken", res.accessToken);
      localStorage.setItem("userInfo", JSON.stringify(res.userInfo));
      return { ok: true, name: res.userInfo.full_name || res.userInfo.username };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  })()`);

  if (!result?.ok) {
    throw new Error(
      `demo login failed: ${result?.error ?? "unknown"}. ` +
        `Run: npm run seed:demo -- --reset`
    );
  }

  // Reload so every context and query re-reads the new identity.
  if (!(await cdp.reload())) {
    throw new Error("app did not come back up after switching user");
  }
  return result.name;
}

/**
 * Pins the accent preset. localStorage is what the app reads at startup
 * (useColorTheme.ts), so writing it here and reloading is equivalent to
 * choosing the preset in Settings, and survives the identity switch above.
 */
async function ensureTheme(cdp, name) {
  const colors = PRESETS[name];
  if (!colors) {
    throw new Error(`Unknown theme "${name}". Available: ${PRESET_NAMES.join(", ")}`);
  }

  const current = await cdp.evaluate(`(() => {
    try { return (JSON.parse(localStorage.getItem('colorTheme') || '{}')).selectedTheme ?? null; }
    catch { return null; }
  })()`);

  if (current === name) return name;

  await cdp.evaluate(`localStorage.setItem('colorTheme', ${JSON.stringify(
    JSON.stringify({ selectedTheme: name, useCustomColors: false, customColors: colors })
  )})`);
  if (!(await cdp.reload())) {
    throw new Error("app did not come back up after applying the theme");
  }
  return name;
}

const shots = {
  dashboard: {
    file: "dashboard.png",
    hash: "#/dashboard",
    wait: '[data-testid="stat-card-entries"]',
    settle: 2000,
    scrollTo: "top",
    // Both charts must have actually painted marks, not just mounted.
    verify: `document.querySelectorAll('.recharts-area-area').length > 0
             && document.querySelectorAll('.recharts-sector').length > 0`,
  },

  "dashboard-memories": {
    file: "dashboard-memories.png",
    hash: "#/dashboard",
    wait: '[data-testid="memories-grid"]',
    settle: 2500,
    scrollTo: '[data-testid="memories-grid"]',
    // The masonry paints tiles as CSS background-image on divs, not <img>
    // elements, so counting images finds nothing however long you wait.
    verify: `(() => {
      const grid = document.querySelector('[data-testid="memories-grid"]');
      if (!grid) return false;
      // Plain substring test rather than a regex: this whole expression lives
      // in a JS template literal, where a backslash escape is swallowed before
      // the regex is ever parsed, leaving an unterminated group that throws on
      // every poll and looks exactly like "the content never rendered".
      const tiles = [...grid.querySelectorAll('div')].filter((d) =>
        getComputedStyle(d).backgroundImage.includes('data:image')
      );
      return tiles.length >= 6;
    })()`,
  },

  journals: {
    file: "journals.png",
    hash: "#/journals",
    wait: '[data-testid="mood-calendar"]',
    settle: 1800,
    scrollTo: "top",
    verify: `document.querySelectorAll('[data-testid="journal-card"]').length >= 5`,
    async prepare(cdp) {
      // The mood calendar is built from the entries currently loaded, and the
      // list pages in ten at a time - so a fresh view colours only ~5 days of a
      // 30-day grid and the calendar reads as though the app is barely used.
      // Page in more, then return to the top for the shot.
      for (let page = 0; page < 4; page++) {
        await cdp.scrollTo("bottom");
        await cdp.sleep(900);
      }
      await cdp.scrollTo("top");
      await cdp.sleep(700);
    },
  },

  "journal-detail": {
    file: "journal-detail.png",
    hash: null, // resolved from the newest entry
    wait: '[data-testid="mood-orb"]',
    settle: 1500,
    async before(cdp) {
      await cdp.goto("#/journals");
      await cdp.waitFor('[data-testid="journal-card"]');
      await cdp.sleep(900);
      // Target the voice entry specifically. It is the only one carrying both a
      // transcription and a summary, so it is the one where the AI Insights
      // panel is fully populated - on any other entry half the panel is absent
      // and the sidebar reads as though the feature did nothing.
      const id = await cdp.evaluate(`(() => {
        const cards = [...document.querySelectorAll('[data-testid="journal-card"]')];
        const preferred = cards.find((c) =>
          c.innerText.includes("Ten miles, and I didn't die")
        );
        const card = preferred ?? cards[0];
        return card ? card.dataset.journalId : null;
      })()`);
      if (!id) throw new Error("no journal cards found - has the seeder run?");
      await cdp.goto(`#/journal/view/${id}`);
    },
    async prepare(cdp) {
      // Open both AI accordions - collapsed, the panel that proves the local-AI
      // story reads as two empty grey bars.
      for (const sel of [
        '[data-testid="ai-transcription-accordion"]',
        '[data-testid="ai-summary-accordion"]',
      ]) {
        try {
          await cdp.click(sel);
          await cdp.sleep(450);
        } catch {
          /* transcription only exists on entries that have one */
        }
      }
    },
  },

  editor: {
    file: "editor.png",
    hash: "#/journal/new",
    wait: '[data-testid="journal-body-input"]',
    settle: 1000,
    async prepare(cdp) {
      await cdp.evaluate(`(() => {
        const setValue = (el, value) => {
          const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          // React tracks the previous value on the node; assigning .value
          // directly is silently ignored on the next render, so go through the
          // native setter and then fire the event React actually listens for.
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setValue(document.querySelector('[data-testid="journal-title-input"]'),
          'Ten miles, and I didn\\'t die');
        setValue(document.querySelector('[data-testid="journal-body-input"]'),
          "Ten miles. The longest I have ever run in my life, by two whole miles.\\n\\nI went out along the canal because it's flat and because I didn't want to make any decisions past mile six. That turned out to be right. Somewhere around eight my brain went completely quiet - not the good meditative quiet people describe, more like it had shut down non-essential systems.");
      })()`);
      await cdp.sleep(700);
    },
  },

  goals: {
    file: "goals.png",
    hash: "#/goals",
    wait: '[data-testid="goal-card"]',
    settle: 1800,
    verify: `document.querySelectorAll('[data-testid="goal-card"]').length >= 4`,
  },

  chat: {
    file: "chat.png",
    hash: "#/chat",
    wait: '[data-testid="chat-composer"]',
    settle: 1800,
    verify: `document.querySelectorAll('[data-testid="chat-message"]').length >= 3`,
    async before(cdp) {
      await cdp.goto("#/chat");
      await cdp.waitFor('[data-testid="chat-sidebar-toggle"]');
      await cdp.sleep(900);

      // The sidebar starts collapsed, reducing the saved conversations to a
      // column of anonymous icons, and the main pane defaults to the empty
      // welcome state - so the default view of a well-used account looks like
      // a fresh install. Expand it and open the seeded conversation.
      const expanded = await cdp.evaluate(
        `document.querySelectorAll('[data-testid="chat-list-item"]').length > 0
         && !!document.querySelector('[data-testid="chat-list-item"]').innerText.trim()`
      );
      if (!expanded) {
        await cdp.click('[data-testid="chat-sidebar-toggle"]');
        await cdp.sleep(800);
      }

      await cdp.click('[data-testid="chat-list-item"]');
      await cdp.sleep(1500);
    },
  },

  search: {
    file: "search.png",
    hash: "#/dashboard",
    wait: '[data-testid="stat-card-entries"]',
    settle: 800,
    async prepare(cdp) {
      await cdp.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'f', ctrlKey: true, bubbles: true
      }))`);
      const opened = await cdp.waitFor('[data-testid="global-search-input"]', 5000);
      if (!opened) throw new Error("global search did not open");
      await cdp.evaluate(`(() => {
        const el = document.querySelector('[data-testid="global-search-input"]');
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
          .set.call(el, 'the presentation I was dreading');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      // This phrasing appears verbatim in no entry, yet returns three of the
      // hand-written ones - which is the point of the feature and what makes
      // the shot worth taking. Keyword-ish queries surface filler entries that
      // share stock phrasing, which reads as generated.
      // Semantic search embeds the query through Ollama and queries Qdrant.
      await cdp.sleep(3000);
    },
    skipDockHover: true,
  },
};

async function run() {
  const argv = process.argv.slice(2);
  const themeIdx = argv.indexOf("--theme");
  const theme = themeIdx !== -1 ? argv[themeIdx + 1] : DEFAULT_THEME;

  // Guard the themeIdx check: with no --theme flag themeIdx is -1, so
  // `i !== themeIdx + 1` silently drops argv[0] and turns a single-shot run
  // into a full-set run.
  const themeValueIdx = themeIdx === -1 ? -1 : themeIdx + 1;
  const requested = argv.filter(
    (a, i) => !a.startsWith("-") && i !== themeValueIdx
  );
  const names = requested.length ? requested : Object.keys(shots);

  const unknown = names.filter((n) => !shots[n]);
  if (unknown.length) {
    console.error(`Unknown shot(s): ${unknown.join(", ")}`);
    console.error(`Available: ${Object.keys(shots).join(", ")}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cdp = await attach(process.env.MS_REMOTE_DEBUG ?? "9222");
  console.log(`Attached to ${cdp.title} (${cdp.url})`);

  // Poll rather than check once. Vite HMR reloads the renderer on any source
  // edit, and mid-reload document.body is briefly null - which would otherwise
  // abort a whole capture run for a race that resolves in under a second.
  let ready = false;
  const readyDeadline = Date.now() + 30000;
  while (Date.now() < readyDeadline) {
    try {
      ready = await cdp.evaluate(
        "!!document.body && document.body.dataset.appReady === 'true' && !!window.electron"
      );
    } catch {
      ready = false;
    }
    if (ready) break;
    await cdp.sleep(500);
  }
  if (!ready) {
    console.error(
      "\nApp is not ready, or this is not the Electron renderer.\n" +
        "Start it with `npm run dev:capture` and wait for the window to appear."
    );
    cdp.close();
    process.exit(1);
  }

  const who = await ensureDemoUser(cdp);
  const appliedTheme = await ensureTheme(cdp, theme);
  console.log(`Capturing as: ${who}  |  theme: ${appliedTheme}`);

  await cdp.setViewport(VIEWPORT);
  await cdp.forceRelayout();
  console.log(
    `Viewport ${VIEWPORT.width}x${VIEWPORT.height} @${VIEWPORT.deviceScaleFactor}x ` +
      `-> ${VIEWPORT.width * VIEWPORT.deviceScaleFactor}x${VIEWPORT.height * VIEWPORT.deviceScaleFactor}px\n`
  );

  const results = [];

  for (const name of names) {
    const shot = shots[name];
    process.stdout.write(`  ${name.padEnd(20)}`);
    try {
      // Reset transient UI before every shot. Overlays outlive navigation -
      // the global search palette opened for one shot stays up over the next
      // one, which produces a perfectly sharp screenshot of the wrong screen.
      await cdp.evaluate(`(() => {
        document.querySelectorAll('[aria-label="Close search"]').forEach((b) => b.click());
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        return true;
      })()`);
      await cdp.sleep(500);

      if (shot.before) await shot.before(cdp);
      else if (shot.hash) await cdp.goto(shot.hash);

      if (shot.wait) {
        const found = await cdp.waitFor(shot.wait);
        if (!found) throw new Error(`timed out waiting for ${shot.wait}`);
      }
      await cdp.sleep(shot.settle ?? SETTLE);

      if (shot.verify) {
        let painted = await cdp.waitUntil(shot.verify, 6000);
        // One relayout retry: charts occasionally mount at zero height after a
        // navigation and only re-measure when the observer is poked.
        for (let attempt = 0; !painted && attempt < 2; attempt++) {
          await cdp.forceRelayout();
          await cdp.sleep(900);
          painted = await cdp.waitUntil(shot.verify, 6000);
        }
        if (!painted) throw new Error("content did not finish rendering");
      }

      // Clear any hover state before preparing, so no tooltip is left pinned
      // open over the content from an earlier step.
      await cdp.resetPointer();

      if (shot.prepare) await shot.prepare(cdp);

      // Expand the dock last - it collapses 100ms after the pointer leaves, so
      // this has to be the final act before the shutter.
      if (!shot.skipDockHover) {
        const route = (await cdp.evaluate("location.hash")) || "";
        const key = route.includes("/dashboard")
          ? "dashboard"
          : route.includes("/journals")
            ? "journals"
            : route.includes("/goals")
              ? "goals"
              : route.includes("/chat")
                ? "chat"
                : "write";
        // Hover the item for the current screen. Hovering the dock's midpoint
        // pops the label of whichever neighbour is nearest, which reads as a
        // mistake when it names a different page than the one on screen.
        const dock =
          (await cdp.centreOf(`[data-testid="dock-item-${key}"]`)) ??
          (await cdp.centreOf('[data-testid="dock"]'));
        if (dock) {
          // Clear any hover picked up while preparing the shot, then approach
          // the dock from below so the path crosses nothing but empty margin.
          await cdp.resetPointer();
          await cdp.sleep(350);
          await cdp.hover(dock.x, dock.y);
          await cdp.sleep(500);
        }
      } else {
        await cdp.resetPointer();
      }

      // Scroll last. Hovering the dock and any prepare steps can shift the
      // scroller, so position is only trustworthy immediately before capture.
      if (shot.scrollTo) {
        await cdp.scrollTo(shot.scrollTo);
        await cdp.sleep(600);
      }

      // Recharts keeps a tooltip open until its wrapper sees the pointer leave.
      // CDP mouse moves do not always deliver that, which pins a floating
      // "Mood Score" card over the chart in the final image.
      await cdp.evaluate(`(() => {
        document.querySelectorAll('.recharts-wrapper').forEach((el) => {
          el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
        });
        return true;
      })()`);
      await cdp.sleep(350);

      const png = await cdp.screenshot();
      const dest = path.join(OUT_DIR, shot.file);
      fs.writeFileSync(dest, png);
      console.log(`ok  ${(png.length / 1024).toFixed(0)} KB  ${shot.file}`);
      results.push({ name, ok: true });
    } catch (err) {
      console.log(`FAILED  ${err.message}`);
      results.push({ name, ok: false, error: err.message });
    }
  }

  await cdp.clearViewport();
  cdp.close();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} captured -> ${OUT_DIR}`
  );
  if (failed.length) {
    console.log("Failed:");
    failed.forEach((f) => console.log(`  ${f.name}: ${f.error}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
