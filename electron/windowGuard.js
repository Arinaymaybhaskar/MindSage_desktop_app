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
  const base = pathToFileURL(distDir).href.replace(/\/?$/, "/");
  return decodeURI(target.href).startsWith(decodeURI(base));
}

/**
 * Listeners for one webContents. `openExternal` receives the links a page
 * asked to open in a new window, when they are safe to hand to the OS.
 */
export function guardContents(contents, { isApp, openExternal }) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url) && !isApp(url)) openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (!isApp(url)) event.preventDefault();
  });
  contents.on("will-redirect", (event, url) => {
    if (!isApp(url)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}
