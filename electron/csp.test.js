import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildCsp, cspPlugin } from "./csp.js";

const parse = (policy) =>
  Object.fromEntries(
    policy.split(/;\s*/).map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  );

const root = path.resolve(__dirname, "..");

describe("production policy", () => {
  const csp = parse(buildCsp());

  it("allows scripts from the app only: no inline script, no eval", () => {
    expect(csp["script-src"]).toEqual(["'self'"]);
  });

  it("allows no network connection from the renderer", () => {
    expect(csp["connect-src"]).toEqual(["'self'"]);
  });

  it("names no outside host, wildcard or websocket anywhere", () => {
    const text = buildCsp();
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/wss?:/);
    expect(text).not.toMatch(/\*/);
    expect(text).not.toMatch(/unsafe-eval/);
  });

  it("falls back to the app itself and forbids plugins, base changes and foreign forms", () => {
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
  });

  it("lets entries' images and audio, and the PDF viewer, work from data: and blob:", () => {
    expect(csp["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(csp["media-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(csp["frame-src"]).toEqual(["data:"]);
    expect(csp["font-src"]).toEqual(["'self'"]);
  });

  it("only uses unsafe-inline for styles", () => {
    expect(csp["style-src"]).toContain("'unsafe-inline'");
    for (const [name, values] of Object.entries(csp)) {
      if (name !== "style-src") expect(values).not.toContain("'unsafe-inline'");
    }
  });

  it("stays short enough that <meta charset> still falls inside the first 1024 bytes", () => {
    // Vite escapes each ' as &#39; (4 extra bytes) when it writes the tag.
    const text = buildCsp();
    const served = text.length + 4 * (text.match(/'/g) ?? []).length;
    expect(served).toBeLessThan(600);
  });
});

describe("dev policy", () => {
  const prod = parse(buildCsp());
  const dev = parse(buildCsp({ dev: true }));

  it("adds the hot-reload socket, the React preamble and the local Qdrant inspector", () => {
    expect(dev["connect-src"]).toEqual(
      expect.arrayContaining([
        "'self'",
        "ws://localhost:*",
        "ws://127.0.0.1:*",
        "http://127.0.0.1:*",
      ]),
    );
    expect(dev["script-src"]).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("only ever adds to the production policy, never removes from it", () => {
    for (const [name, values] of Object.entries(prod)) {
      expect(dev[name]).toEqual(expect.arrayContaining(values));
    }
    // and touches only these two directives
    const changed = Object.keys(dev).filter(
      (n) => JSON.stringify(dev[n]) !== JSON.stringify(prod[n]),
    );
    expect(changed.sort()).toEqual(["connect-src", "script-src"]);
  });

  it("keeps the outside web out even in dev", () => {
    const tokens = buildCsp({ dev: true }).split(/[\s;]+/);
    expect(tokens).not.toContain("*");
    expect(tokens.filter((t) => t.startsWith("https:"))).toEqual([]);
    // every network source left is the machine itself
    const network = tokens.filter((t) => /^(?:wss?|https?):/.test(t));
    for (const source of network)
      expect(source).toMatch(/^(?:ws|http):\/\/(?:localhost|127\.0\.0\.1):\*$/);
  });
});

describe("vite.config.ts", () => {
  it("installs the CSP plugin, so index.html gets the policy in every build", () => {
    const config = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
    expect(config).toMatch(
      /import \{ cspPlugin \} from ["']\.\/electron\/csp\.js["']/,
    );
    expect(config).toMatch(/plugins:\s*\[\s*cspPlugin\(\)/);
  });
});

describe("cspPlugin", () => {
  const meta = (ctx) => cspPlugin().transformIndexHtml("", ctx);

  it("injects the strict policy as the first thing in <head> for a build", () => {
    const [tag] = meta({ bundle: {} });
    expect(tag).toMatchObject({
      tag: "meta",
      injectTo: "head-prepend",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: buildCsp(),
      },
    });
  });

  it("injects the dev policy when served by the dev server", () => {
    const [tag] = meta({ server: {} });
    expect(tag.attrs.content).toBe(buildCsp({ dev: true }));
    expect(tag.attrs.content).not.toBe(buildCsp());
  });
});

// The policy only means something if the page does not need to break it.
describe("what the renderer ships", () => {
  it("index.html has no inline script and no outside reference", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    for (const attrs of scripts) expect(attrs).toMatch(/\bsrc=/);
    expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//);
  });

  it("no stylesheet pulls anything from the network (fonts stay bundled)", () => {
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : p.endsWith(".css") ? [p] : [];
      });
    for (const file of walk(path.join(root, "src"))) {
      const css = fs
        .readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(/@import\s+(?:url\()?["']?https?:/);
      expect(css, file).not.toMatch(/url\(\s*["']?https?:/);
    }
  });
});
