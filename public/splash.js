try {
  const { ipcRenderer } = require("electron");
  const statusEl = document.getElementById("status");
  ipcRenderer.on("splash-status", (_evt, text) => {
    if (statusEl && typeof text === "string") statusEl.textContent = text;
  });
} catch (e) {
  // non-Electron fallback: do nothing
}

// In dev, splash.html is served over http by the Vite dev server, so the
// runtime's own fetch()-based loading works. In the packaged app it's opened
// via file://, and Chromium's fetch() refuses the file: scheme outright, so
// the wasm/riv bytes have to be read through Node's fs instead (available
// here because this window runs with nodeIntegration on).
const isPackaged = window.location.protocol === "file:";

function localPath(relative) {
  const path = require("path");
  let pathname = decodeURIComponent(new URL(window.location.href).pathname);
  if (process.platform === "win32" && pathname.startsWith("/")) {
    pathname = pathname.slice(1);
  }
  return path.join(path.dirname(pathname), relative);
}

function readLocal(relative) {
  const fs = require("fs");
  return new Uint8Array(fs.readFileSync(localPath(relative))).buffer;
}

if (isPackaged) {
  rive.RuntimeLoader.setWasmBinary(readLocal("rive/rive.wasm"));
} else {
  rive.RuntimeLoader.setWasmUrl("./rive/rive.wasm");
}
// Fully local either way: no CDN fallback, matches the app's offline-first
// rule that already keeps fonts bundled instead of fetched at startup.
rive.RuntimeLoader.setWasmFallbackUrl(null);

const canvas = document.getElementById("logo");

const r = new rive.Rive({
  ...(isPackaged
    ? { buffer: readLocal("rive/logo-loader.riv") }
    : { src: "./rive/logo-loader.riv" }),
  canvas,
  autoplay: true,
  animations: "loop",
  onLoad: () => {
    r.resizeDrawingSurfaceToCanvas();

    canvas.classList.add("ready");

    const staticLogo = document.getElementById("static-logo");
    if (staticLogo) {
      staticLogo.style.display = "none";
    }
  },
});
