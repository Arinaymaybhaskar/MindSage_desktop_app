// Content-Security-Policy for the main window, injected into index.html by the
// Vite plugin in vite.config.ts. Pure and import-free so it can be tested.
//
// The point of it: "MindSage makes no outside requests" is enforced by
// Chromium here, not just promised. Nothing in the renderer may load script,
// style, font or data from anywhere but the app itself.
//
// Why each directive is what it is:
//   script-src 'self'         bundled code only; no inline script, no eval
//   style-src + 'unsafe-inline'  React and Tailwind set style attributes
//   img-src / media-src       entries' images and audio arrive over IPC as
//                             data: URLs, and previews are blob: URLs
//   font-src 'self'          fonts are bundled (src/index.css), never fetched
//   frame-src data:           the chat PDF viewer shows a data: URL in an iframe
//   connect-src 'self'        the renderer talks to the main process over IPC,
//                             never over the network
//   object-src 'none'         no plugins
//
// A <meta> policy cannot carry frame-ancestors, report-uri or sandbox, so
// those are left out. The splash has its own policy in public/splash.html.

const unique = (list) => [...new Set(list)];

export function buildCsp({ dev = false } = {}) {
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "media-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "frame-src": ["data:"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  if (dev) {
    // Only the Vite dev server: its hot-reload socket, the inline preamble
    // @vitejs/plugin-react writes into the page, and the local Qdrant the
    // dev-only /qdrant inspector queries. Never in a built app.
    directives["connect-src"].push(
      "ws://localhost:*",
      "ws://127.0.0.1:*",
      "http://127.0.0.1:*",
    );
    directives["script-src"].push("'unsafe-inline'");
  }

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${unique(values).join(" ")}`)
    .join("; ");
}

// Vite plugin: adds the policy as the first thing in <head>.
export function cspPlugin() {
  return {
    name: "mindsage-csp",
    transformIndexHtml(_html, ctx) {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: buildCsp({ dev: Boolean(ctx.server) }),
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}
