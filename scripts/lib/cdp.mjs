/**
 * Tiny Chrome DevTools Protocol client for driving the running Electron app.
 *
 * Node 22 ships a global WebSocket, so this needs no dependencies. It exists so
 * screenshot and demo-video runs can drive the *real* renderer - preload
 * bridge, IPC, SQLite and all. Pointing an ordinary browser at the Vite URL
 * instead gives a shell with no `window.electron`, where every IPC call
 * rejects and the app renders empty.
 *
 * Requires the app started with a debugging port:  npm run dev:capture
 */

export async function attach(port = "9222") {
  let targets;
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    throw new Error(
      `No CDP endpoint on 127.0.0.1:${port}. Start the app with: npm run dev:capture`,
    );
  }

  const page = targets.find(
    (t) => t.type === "page" && !t.url.startsWith("devtools://"),
  );
  if (!page) throw new Error("No app page target found on the CDP endpoint.");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;

  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () =>
      reject(new Error("Failed to open CDP WebSocket")),
    );
  });

  const send = (method, params = {}, { timeoutMs = 20000 } = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      // Every command is bounded. Reloading tears down the execution context,
      // and any Runtime.evaluate still in flight never receives a reply - an
      // unbounded wait there hangs the whole capture run with no output.
      const timer = setTimeout(() => {
        pending.delete(msgId);
        reject(new Error(`${method}: timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      pending.set(msgId, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  /** Evaluates an expression in the page and returns its value. */
  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `evaluate failed: ${res.exceptionDetails.text} ${
          res.exceptionDetails.exception?.description ?? ""
        }`,
      );
    }
    return res.result?.value;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    title: page.title,
    url: page.url,
    send,
    evaluate,
    sleep,
    close: () => ws.close(),

    /**
     * Overrides the renderer's viewport and pixel density. deviceScaleFactor is
     * the reason this is worth doing at all: it yields genuine 2x assets on an
     * ordinary 1x display, which no OS screenshot tool can produce.
     */
    async setViewport({ width, height, deviceScaleFactor = 2 }) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor,
        mobile: false,
      });
    },

    /**
     * Nudges the layout so measurement-based components re-render.
     *
     * Recharts sizes itself from a ResizeObserver on its parent. Overriding the
     * device metrics changes the layout without reliably firing that observer,
     * so charts can paint at zero height - which is how a dashboard screenshot
     * ends up with an empty Score Chart and an empty donut.
     */
    async forceRelayout() {
      await evaluate(`(() => {
        window.dispatchEvent(new Event('resize'));
        void document.body.offsetHeight;
        return true;
      })()`);
      await sleep(400);
    },

    /** Polls an expression until it returns truthy. */
    async waitUntil(expression, timeoutMs = 12000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          if (await evaluate(expression)) return true;
        } catch {
          /* transient during re-render */
        }
        await sleep(250);
      }
      return false;
    },

    async clearViewport() {
      await send("Emulation.clearDeviceMetricsOverride");
    },

    /**
     * Reloads and waits for the app to come back up.
     *
     * Page.reload is used rather than evaluating location.reload(): the latter
     * destroys the context that owes us the reply, so the call never settles.
     * Failures here are swallowed deliberately - the reload itself is the
     * point, and readiness is then confirmed by polling.
     */
    async reload({ timeoutMs = 30000 } = {}) {
      try {
        await send("Page.reload", { ignoreCache: false }, { timeoutMs: 5000 });
      } catch {
        /* the navigation may cut the reply short; readiness is polled below */
      }

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const ready = await evaluate(
            "!!document.body && document.body.dataset.appReady === 'true' && !!window.electron",
          );
          if (ready) {
            await sleep(600);
            return true;
          }
        } catch {
          /* context still being torn down or rebuilt */
        }
        await sleep(400);
      }
      return false;
    },

    /** Navigates the HashRouter without reloading and losing app state. */
    async goto(hash) {
      await evaluate(`location.hash = ${JSON.stringify(hash)}`);
    },

    /**
     * Moves the real pointer via CDP. Needed for anything hover-driven - most
     * importantly the Dock, which collapses to a thin pill 100ms after the
     * pointer leaves and would otherwise be nearly invisible in every frame.
     */
    async hover(x, y, { from, steps = 12 } = {}) {
      // Default approach is straight up from directly below the target. The
      // naive path - interpolating from the origin - drags the pointer across
      // the page and leaves Recharts tooltips pinned open over the content,
      // which lands in the screenshot as a floating grey box.
      const start = from ?? { x, y: y + 260 };
      for (let i = 1; i <= steps; i++) {
        await send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: Math.round(start.x + ((x - start.x) * i) / steps),
          y: Math.round(start.y + ((y - start.y) * i) / steps),
        });
        await sleep(16);
      }
    },

    /**
     * Pushes the pointer far off-canvas so no hover state survives into the
     * shot. Dispatching at negative coordinates does not fire leave handlers
     * reliably, so nudge to a corner well away from interactive content first.
     */
    async resetPointer() {
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: 2,
        y: 2,
      });
      await sleep(120);
    },

    /**
     * Scrolls the app's scroll container. The document itself never scrolls -
     * the layout puts the scrollbar on an inner `div.h-full.overflow-y-auto`,
     * so window.scrollTo() is a silent no-op and leaves the page wherever the
     * last interaction left it.
     *
     * Pass "top", "bottom", or a selector to bring into view.
     */
    async scrollTo(target) {
      return evaluate(`(() => {
        const scroller = [...document.querySelectorAll('*')].find(el =>
          el.scrollHeight > el.clientHeight + 40 &&
          /(auto|scroll)/.test(getComputedStyle(el).overflowY)
        );
        if (!scroller) return false;
        const target = ${JSON.stringify(target)};
        if (target === 'top') { scroller.scrollTop = 0; return true; }
        if (target === 'bottom') { scroller.scrollTop = scroller.scrollHeight; return true; }
        const el = document.querySelector(target);
        if (!el) return false;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        return true;
      })()`);
    },

    /** Centre coordinates of an element, or null if it isn't present. */
    async centreOf(selector) {
      return evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`);
    },

    async click(selector) {
      const ok = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.click();
        return true;
      })()`);
      if (!ok) throw new Error(`click: no element matching ${selector}`);
    },

    /** Waits for a selector, polling. Returns false on timeout rather than throwing. */
    async waitFor(selector, timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = await evaluate(
          `!!document.querySelector(${JSON.stringify(selector)})`,
        );
        if (found) return true;
        await sleep(200);
      }
      return false;
    },

    /** PNG screenshot of the current viewport, as a Buffer. */
    async screenshot({ fullPage = false } = {}) {
      const result = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: fullPage,
        optimizeForSpeed: false,
      });
      return Buffer.from(result.data, "base64");
    },
  };
}
