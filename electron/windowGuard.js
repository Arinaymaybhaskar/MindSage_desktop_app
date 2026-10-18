// Where a window may go and what it may open. The Content-Security-Policy
// covers what a page loads (electron/csp.js); this covers navigation, new
// windows and links that leave the app. Pure functions so they are testable
// without Electron; main.js wires them to every webContents.
import { pathToFileURL } from "node:url";

// What openExternal may be given. Anything else (file:, javascript:, custom
// app schemes such as ms-msdt:) can run code on the machine.
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function isSafeExternalUrl(url) {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(String(url)).protocol);
  } catch {
    return false;
  }
}

/**
 * True for a URL that is one of the app's own pages: the dev server's origin
 * in development, a file inside the built `dist` folder when packaged.
 */
export function isAppUrl(url, { devUrl, distDir }) {
  let target;
  try {
    target = new URL(String(url));
  } catch {
    return false;
  }
  if (devUrl) return target.origin === new URL(devUrl).origin;
  if (target.protocol !== "file:" || !distDir) return false;
  if (target.host !== "" && target.host !== "localhost") return false;
  // An escaped separator is how a path would climb out once decoded.
  if (/%2f|%5c/i.test(target.pathname)) return false;
  // Both pathnames are the canonical, still percent-encoded form, so no
  // decoding is needed (and a malformed escape cannot throw).
  const base = pathToFileURL(distDir).pathname.replace(/\/?$/, "/");
  return process.platform === "win32"
    ? target.pathname.toLowerCase().startsWith(base.toLowerCase())
    : target.pathname.startsWith(base);
}

/**
 * Listeners for one webContents. `openExternal` receives the links a page
 * asked to open in a new window, when they are safe to hand to the OS.
 */
export function guardContents(contents, { isApp, openExternal }) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url) && !isApp(url)) openExternal(new URL(url).href);
    return { action: "deny" };
  });
  // Fail closed: a URL the check cannot judge is not the app's.
  const refuseOutsideApp = (event, url) => {
    let inside = false;
    try {
      inside = isApp(url);
    } catch {
      // stays false
    }
    if (!inside) event.preventDefault();
  };
  contents.on("will-navigate", refuseOutsideApp);
  contents.on("will-redirect", refuseOutsideApp);
  contents.on("will-attach-webview", (event) => event.preventDefault());
}
