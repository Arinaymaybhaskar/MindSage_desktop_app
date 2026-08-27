/**
 * Screenshot capture environment setup.
 *
 * Paste this whole file into the app's DevTools console (Ctrl+Shift+I), then
 * reload. It puts the renderer into a known, repeatable state so every capture
 * in a session matches every other one.
 *
 * Usage in the console after pasting:
 *   capture.setup()          // everything below, then tells you to reload
 *   capture.theme("Ocean")   // switch accent preset without clicking through
 *   capture.embed()          // sync seeded entries into Qdrant for search
 *   capture.check()          // report anything still wrong for a clean shot
 */
(() => {
  const PRESETS = {
    Default: {
      light1: "hsl(232, 33%, 75%)",
      light2: "hsl(191, 26%, 82%)",
      light3: "hsl(120, 24%, 87%)",
      light4: "hsl(68, 48%, 90%)",
      dark1: "hsl(235, 17%, 25%)",
      dark2: "hsl(202, 25%, 27%)",
      dark3: "hsl(193, 21%, 40%)",
      dark4: "hsl(136, 17%, 55%)",
    },
    Neutral: {
      light1: "hsl(0, 0%, 75%)",
      light2: "hsl(0, 0%, 82%)",
      light3: "hsl(0, 0%, 87%)",
      light4: "hsl(0, 0%, 90%)",
      dark1: "hsl(0, 0%, 25%)",
      dark2: "hsl(0, 0%, 27%)",
      dark3: "hsl(0, 0%, 40%)",
      dark4: "hsl(0, 0%, 55%)",
    },
    Ocean: {
      light1: "hsl(200, 50%, 70%)",
      light2: "hsl(180, 40%, 75%)",
      light3: "hsl(160, 30%, 80%)",
      light4: "hsl(140, 25%, 85%)",
      dark1: "hsl(200, 30%, 20%)",
      dark2: "hsl(180, 25%, 25%)",
      dark3: "hsl(160, 20%, 35%)",
      dark4: "hsl(140, 15%, 50%)",
    },
    Sunset: {
      light1: "hsl(15, 60%, 75%)",
      light2: "hsl(35, 50%, 80%)",
      light3: "hsl(55, 40%, 85%)",
      light4: "hsl(75, 30%, 90%)",
      dark1: "hsl(15, 40%, 25%)",
      dark2: "hsl(35, 30%, 30%)",
      dark3: "hsl(55, 25%, 40%)",
      dark4: "hsl(75, 20%, 55%)",
    },
    Forest: {
      light1: "hsl(120, 40%, 70%)",
      light2: "hsl(100, 35%, 75%)",
      light3: "hsl(80, 30%, 80%)",
      light4: "hsl(60, 25%, 85%)",
      dark1: "hsl(120, 25%, 20%)",
      dark2: "hsl(100, 20%, 25%)",
      dark3: "hsl(80, 15%, 35%)",
      dark4: "hsl(60, 10%, 50%)",
    },
    Purple: {
      light1: "hsl(270, 50%, 75%)",
      light2: "hsl(250, 40%, 80%)",
      light3: "hsl(230, 30%, 85%)",
      light4: "hsl(210, 25%, 90%)",
      dark1: "hsl(270, 30%, 25%)",
      dark2: "hsl(250, 25%, 30%)",
      dark3: "hsl(230, 20%, 40%)",
      dark4: "hsl(210, 15%, 55%)",
    },
  };

  const capture = {
    /** Switch accent preset without clicking through Settings. Reload after. */
    theme(name = "Ocean") {
      const customColors = PRESETS[name];
      if (!customColors) {
        console.warn(
          `Unknown preset "${name}". Try: ${Object.keys(PRESETS).join(", ")}`,
        );
        return;
      }
      localStorage.setItem(
        "colorTheme",
        JSON.stringify({
          selectedTheme: name,
          useCustomColors: false,
          customColors,
        }),
      );
      console.log(`Theme set to ${name}. Reload to apply.`);
    },

    setup({ theme = "Ocean" } = {}) {
      // Skip the first-run redirect to /setup (src/App.tsx:53-67).
      localStorage.setItem("setup_complete", "1");
      // Pin zoom - App.tsx restores this on boot and a stray value silently
      // rescales every capture.
      localStorage.setItem("zoom_scale", "100");
      // Hide the "no generation model" strip that otherwise sits under the
      // titlebar in every frame (src/components/AIReadinessBanner.tsx).
      sessionStorage.setItem("ai_banner_dismissed", "1");
      this.theme(theme);
      console.log("Capture environment set. Reload now (Ctrl+R), then:");
      console.log("  - maximise the window");
      console.log("  - hover the dock before shooting so it expands");
      console.log("  - Win+Shift+S, window mode, to capture");
    },

    /**
     * Embeds seeded entries so semantic search returns results. Seeded rows
     * fire no journal:created event, so nothing is indexed until this runs.
     * Needs Ollama with nomic-embed-text, plus Qdrant (started by the app).
     */
    async embed() {
      console.log(
        "Starting bulk sync - watch the main process log for progress...",
      );
      await window.electron.ipcRenderer.invoke("qdrant:bulk-sync");
      console.log("Bulk sync requested. Give it a minute, then try Ctrl+F.");
    },

    /** Reports anything that would spoil a shot. */
    check() {
      const problems = [];
      const ok = [];

      const ready = document.body.dataset.appReady === "true";
      (ready ? ok : problems).push(
        ready ? "services ready" : "services NOT ready (still starting up?)",
      );

      const zoom = localStorage.getItem("zoom_scale");
      (zoom === "100" ? ok : problems).push(
        zoom === "100"
          ? "zoom at 100%"
          : `zoom is ${zoom ?? "unset"}, should be 100`,
      );

      const theme = JSON.parse(localStorage.getItem("colorTheme") || "{}");
      (theme.selectedTheme ? ok : problems).push(
        theme.selectedTheme
          ? `theme "${theme.selectedTheme}"`
          : "no theme set - shots will have no accent colour",
      );

      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      ok.push(`OS theme: ${dark ? "dark" : "light"} (no in-app toggle exists)`);

      const dpr = window.devicePixelRatio;
      (dpr >= 2 ? ok : problems).push(
        dpr >= 2
          ? `devicePixelRatio ${dpr} - captures will be crisp`
          : `devicePixelRatio ${dpr} - captures are 1x; a HiDPI display at 200% scaling gives 2x assets`,
      );

      const w = window.innerWidth;
      (w >= 1400 ? ok : problems).push(
        w >= 1400
          ? `viewport ${w}px`
          : `viewport only ${w}px - layout is max-w-7xl (1280px), so maximise for room to breathe`,
      );

      // The banner carries no identifying attribute, so read the flag it
      // writes on dismissal (AIReadinessBanner.tsx:6) rather than the DOM.
      const bannerDismissed =
        sessionStorage.getItem("ai_banner_dismissed") === "1";
      (bannerDismissed ? ok : problems).push(
        bannerDismissed
          ? "AI readiness banner dismissed"
          : "AI readiness banner may show under the titlebar - run capture.setup()",
      );

      const testids = document.querySelectorAll("[data-testid]").length;
      ok.push(`${testids} test hooks on this screen`);

      console.log("%cReady:", "color:#4ade80;font-weight:bold");
      ok.forEach((m) => console.log("  ✓ " + m));
      if (problems.length) {
        console.log("%cFix before shooting:", "color:#f87171;font-weight:bold");
        problems.forEach((m) => console.log("  ✗ " + m));
      }
      return { ok, problems };
    },
  };

  window.capture = capture;
  console.log(
    "capture.setup() / capture.theme(name) / capture.embed() / capture.check()",
  );
})();
