import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guardContents, isAppUrl, isSafeExternalUrl } from "./windowGuard.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

describe("isSafeExternalUrl", () => {
  it.each([
    "https://ollama.com/library",
    "http://example.com",
    "mailto:someone@example.com",
  ])("allows %s", (url) => expect(isSafeExternalUrl(url)).toBe(true));

  it.each([
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert(1)",
    "ms-msdt:/id PCWDiagnostic",
    "vscode://anything",
    "data:text/html,<script>1</script>",
    "//example.com",
    "not a url",
    "",
    undefined,
    null,
  ])("refuses %s", (url) => expect(isSafeExternalUrl(url)).toBe(false));
});

describe("isAppUrl", () => {
  const dev = { devUrl: "http://localhost:5173/" };
  const packaged = { distDir: "/opt/MindSage/resources/app/dist" };

  it("accepts only the dev server's origin in development", () => {
    expect(isAppUrl("http://localhost:5173/#/journal", dev)).toBe(true);
    expect(isAppUrl("http://localhost:5174/", dev)).toBe(false);
    expect(isAppUrl("https://localhost:5173/", dev)).toBe(false);
    expect(isAppUrl("https://example.com/", dev)).toBe(false);
    expect(
      isAppUrl("file:///opt/MindSage/resources/app/dist/index.html", dev),
    ).toBe(false);
  });

  it("accepts only files inside dist when packaged", () => {
    const base = "file:///opt/MindSage/resources/app/dist";
    expect(isAppUrl(`${base}/index.html#/quick-capture`, packaged)).toBe(true);
    expect(isAppUrl(`${base}/splash.html`, packaged)).toBe(true);
    expect(
      isAppUrl("file:///opt/MindSage/resources/app/dist-evil/x.html", packaged),
    ).toBe(false);
    expect(isAppUrl(`${base}/../secrets.html`, packaged)).toBe(false);
    expect(isAppUrl("file:///etc/passwd", packaged)).toBe(false);
    expect(isAppUrl("https://example.com/", packaged)).toBe(false);
    expect(isAppUrl("http://localhost:5173/", packaged)).toBe(false);
  });

  it("refuses everything it cannot parse or place", () => {
    expect(isAppUrl("not a url", packaged)).toBe(false);
    expect(isAppUrl(undefined, packaged)).toBe(false);
    expect(isAppUrl("file:///opt/x.html", {})).toBe(false);
  });
});

describe("guardContents", () => {
  function setup(isApp = (u) => u.startsWith("app://")) {
    const handlers = {};
    let openHandler;
    const contents = {
      setWindowOpenHandler: (fn) => (openHandler = fn),
      on: (name, fn) => (handlers[name] = fn),
    };
    const openExternal = vi.fn();
    guardContents(contents, { isApp, openExternal });
    return { handlers, open: (url) => openHandler({ url }), openExternal };
  }

  it("never opens a child window, but sends web links to the browser", () => {
    const g = setup();
    expect(g.open("https://example.com/x")).toEqual({ action: "deny" });
    expect(g.openExternal).toHaveBeenCalledWith("https://example.com/x");
  });

  it("denies and does not forward unsafe schemes or the app's own pages", () => {
    const g = setup();
    for (const url of ["file:///etc/passwd", "ms-msdt:/x", "app://index"]) {
      expect(g.open(url)).toEqual({ action: "deny" });
    }
    expect(g.openExternal).not.toHaveBeenCalled();
  });

  it.each(["will-navigate", "will-redirect"])(
    "%s is cancelled for anything outside the app",
    (name) => {
      const g = setup();
      const outside = { preventDefault: vi.fn() };
      g.handlers[name](outside, "https://example.com/");
      expect(outside.preventDefault).toHaveBeenCalled();
      const inside = { preventDefault: vi.fn() };
      g.handlers[name](inside, "app://index.html");
      expect(inside.preventDefault).not.toHaveBeenCalled();
    },
  );

  it("refuses <webview>", () => {
    const g = setup();
    const e = { preventDefault: vi.fn() };
    g.handlers["will-attach-webview"](e);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});

describe("window configuration", () => {
  const sources = {
    "main.js": read("main.js"),
    "windowManager.js": read("windowManager.js"),
  };

  it("gives every BrowserWindow a sandbox, isolation and no Node", () => {
    let windows = 0;
    for (const [file, text] of Object.entries(sources)) {
      const parts = text.split("new BrowserWindow(").slice(1);
      for (const part of parts) {
        windows += 1;
        const block = part.slice(
          part.indexOf("webPreferences"),
          part.indexOf("webPreferences") + 400,
        );
        expect(block, file).toMatch(/sandbox:\s*true/);
        expect(block, file).toMatch(/contextIsolation:\s*true/);
        expect(block, file).toMatch(/nodeIntegration:\s*false/);
        expect(block, file).toMatch(/preload:/);
      }
    }
    expect(windows).toBe(3); // main, Quick Capture, splash
  });

  it("loads the CommonJS preloads that vite.config.ts emits", () => {
    const all = Object.values(sources).join("\n");
    expect(all).not.toMatch(/preload\.mjs/);
    expect(all).toMatch(/preload\.cjs/);
    expect(all).toMatch(/splashPreload\.cjs/);
    const vite = fs.readFileSync(path.join(here, "../vite.config.ts"), "utf8");
    expect(vite).toMatch(/format:\s*"cjs"/);
    expect(vite).toMatch(/entryFileNames:\s*"\[name\]\.cjs"/);
  });

  it("keeps Node out of the preloads and the splash page", () => {
    for (const file of ["preload.js", "splashPreload.js"]) {
      expect(read(file), file).not.toMatch(/\brequire\(/);
    }
    const splash = fs.readFileSync(
      path.join(here, "../public/splash.js"),
      "utf8",
    );
    expect(splash).not.toMatch(/\brequire\(|\bprocess\./);
  });
});
