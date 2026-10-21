import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

function run(hook, input, cwd) {
  const r = spawnSync("node", [path.join(here, hook)], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    cwd,
    timeout: 15000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const g = (cwd, ...a) =>
  execFileSync("git", ["-c", "commit.gpgsign=false", ...a], {
    cwd,
    stdio: "ignore",
  });

let repo;
beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "hooks-test-"));
  g(repo, "init", "-q", "-b", "main");
  g(repo, "config", "user.email", "t@example.com");
  g(repo, "config", "user.name", "t");
  writeFileSync(path.join(repo, "a.txt"), "x");
  g(repo, "add", ".");
  g(repo, "commit", "-q", "-m", "init");
  mkdirSync(path.join(repo, "sub"));
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

const bash = (command) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: repo,
});

describe("guard-git", () => {
  it.each([
    "git push origin main",
    "git push origin HEAD:main",
    "git push origin dev",
    "git push --force origin feat/KAN-1-x",
    "git push -f origin feat/KAN-1-x",
    "git push --force-with-lease origin feat/KAN-1-x",
    "git push origin +feat/KAN-1-x",
  ])("blocks %s", (c) => {
    const r = run("guard-git.mjs", bash(c));
    expect(r.code).toBe(2);
    expect(r.err).toContain("CLAUDE.md");
  });

  it("blocks a bare push while on main", () => {
    expect(run("guard-git.mjs", bash("git push")).code).toBe(2);
  });

  it.each([
    "git push origin feat/KAN-1-x",
    "git push -u origin chore/session-hooks",
    "git push --force-with-lease origin claude/foo",
    "git push --force-with-lease origin backup/pre-x",
    "git push origin phase/p1-make-the-promise-true chore/x",
  ])("allows %s", (c) => {
    expect(run("guard-git.mjs", bash(c)).code).toBe(0);
  });

  it("blocks Co-Authored-By in -m", () => {
    const r = run(
      "guard-git.mjs",
      bash('git commit -m "feat: x\n\nCo-Authored-By: Someone <a@b.c>"'),
    );
    expect(r.code).toBe(2);
    expect(r.err).toContain("Co-Authored-By");
  });

  it("blocks a trailer inside a heredoc message", () => {
    const c = `git commit -m "$(cat <<'EOF'\nfix: y\n\nClaude-Session: https://x\nEOF\n)"`;
    expect(run("guard-git.mjs", bash(c)).code).toBe(2);
  });

  it("blocks a trailer in a -F file", () => {
    writeFileSync(path.join(repo, "msg.txt"), "fix: z\n\nCo-Authored-By: A\n");
    expect(run("guard-git.mjs", bash("git commit -F msg.txt")).code).toBe(2);
  });

  it("allows a plain conventional commit", () => {
    expect(
      run(
        "guard-git.mjs",
        bash('git commit -m "chore(ci): add hooks" && git status'),
      ).code,
    ).toBe(0);
  });

  it.each([
    "git commit --no-verify -m x",
    "git commit -n -m x",
    "git commit -anm x",
  ])("blocks %s", (c) => {
    expect(run("guard-git.mjs", bash(c)).code).toBe(2);
  });

  it("does not treat a message that mentions -n as no-verify", () => {
    expect(
      run("guard-git.mjs", bash('git commit -m "-n flag docs"')).code,
    ).toBe(0);
  });
});

describe("guard-branch", () => {
  const edit = (file, cwd = repo) => ({
    tool_name: "Edit",
    tool_input: { file_path: file },
    cwd,
  });

  it("blocks edits on main", () => {
    const r = run("guard-branch.mjs", edit(path.join(repo, "a.txt")));
    expect(r.code).toBe(2);
    expect(r.err).toContain("<type>/<KEY>-<slug>");
  });

  it("blocks a new file in a subfolder on main (relative path)", () => {
    expect(run("guard-branch.mjs", edit("sub/new.txt")).code).toBe(2);
  });

  it("allows files outside the repo even on main", () => {
    const outside = path.join(tmpdir(), "scratch-not-in-repo.txt");
    expect(run("guard-branch.mjs", edit(outside)).code).toBe(0);
  });

  it("blocks on phase/* and dev, allows on a ticket branch", () => {
    g(repo, "checkout", "-q", "-b", "phase/p9-x");
    expect(run("guard-branch.mjs", edit(path.join(repo, "a.txt"))).code).toBe(
      2,
    );
    g(repo, "checkout", "-q", "-b", "dev");
    expect(run("guard-branch.mjs", edit(path.join(repo, "a.txt"))).code).toBe(
      2,
    );
    g(repo, "checkout", "-q", "-b", "feat/KAN-1-x");
    expect(run("guard-branch.mjs", edit(path.join(repo, "a.txt"))).code).toBe(
      0,
    );
    expect(
      run("guard-branch.mjs", {
        tool_name: "NotebookEdit",
        tool_input: { notebook_path: path.join(repo, "n.ipynb") },
        cwd: repo,
      }).code,
    ).toBe(0);
  });

  it("allows outside any git repo", () => {
    const d = mkdtempSync(path.join(tmpdir(), "nogit-"));
    try {
      expect(run("guard-branch.mjs", edit(path.join(d, "f"), d)).code).toBe(0);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("session-start", () => {
  it("emits additionalContext JSON and exits 0 (offline, no remote)", () => {
    const r = run("session-start.mjs", {
      cwd: repo,
      hook_event_name: "SessionStart",
    });
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(j.hookSpecificOutput.additionalContext).toContain("Co-Authored-By");
    expect(
      j.hookSpecificOutput.additionalContext.split("\n").length,
    ).toBeLessThan(15);
  });
});

describe("context-cap", () => {
  const rec = (type, usage) =>
    JSON.stringify({ type, message: usage ? { usage } : {} });
  const asst = (input, cc = 0, cr = 0) =>
    rec("assistant", {
      input_tokens: input,
      cache_creation_input_tokens: cc,
      cache_read_input_tokens: cr,
      output_tokens: 99999, // output is not context
    });
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "cap-test-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const cap = (lines, name) => {
    const f = path.join(dir, name);
    writeFileSync(f, lines.join("\n") + "\n");
    return run("context-cap.mjs", { transcript_path: f });
  };
  const ctx = (r) => JSON.parse(r.out).hookSpecificOutput;

  it("injects nothing under SOFT", () => {
    const r = cap([asst(10, 20000, 100000)], "under.jsonl");
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
  });

  it("warns between SOFT and HARD, summing the three input fields", () => {
    const r = cap([asst(1000, 50000, 120000)], "mid.jsonl");
    expect(r.code).toBe(0);
    const o = ctx(r);
    expect(o.hookEventName).toBe("UserPromptSubmit");
    expect(o.additionalContext).toContain("~171000 tokens");
    expect(o.additionalContext).toContain("docs/HANDOFF.md");
    expect(o.additionalContext).not.toContain("Stop new work");
  });

  it("adds the stronger lead at HARD", () => {
    const o = ctx(cap([asst(0, 0, 250000)], "over.jsonl"));
    expect(o.additionalContext).toContain("Stop new work");
    expect(o.additionalContext).toContain("~250000 tokens");
  });

  it("uses the last assistant record when it is not the last line", () => {
    const r = cap(
      [asst(1, 0, 400000), asst(1, 0, 160000), rec("user"), rec("system")],
      "notlast.jsonl",
    );
    expect(ctx(r).additionalContext).toContain("~160001 tokens");
  });

  it("reads only the tail of a large file", () => {
    const filler = JSON.stringify({ type: "user", text: "x".repeat(1000) });
    const lines = Array(2000).fill(filler); // ~2 MB
    lines[0] = asst(1, 0, 900000); // old record outside the tail
    lines.push(asst(1, 0, 200000));
    const r = cap(lines, "big.jsonl");
    expect(ctx(r).additionalContext).toContain("~200001 tokens");
  });

  it("injects nothing when the tail has no assistant record", () => {
    const filler = JSON.stringify({ type: "user", text: "x".repeat(1000) });
    const lines = Array(2000).fill(filler);
    lines[0] = asst(1, 0, 900000);
    expect(cap(lines, "noasst.jsonl").out).toBe("");
  });

  it("exits 0 with no output on garbage stdin, bad path or missing file", () => {
    for (const input of [
      "not json {{{",
      "",
      { transcript_path: 5 },
      { transcript_path: path.join(dir, "missing.jsonl") },
      { transcript_path: dir },
    ]) {
      const r = run("context-cap.mjs", input);
      expect(r.code).toBe(0);
      expect(r.out).toBe("");
    }
  });
});

describe("fail open", () => {
  it.each(["guard-git.mjs", "guard-branch.mjs", "session-start.mjs"])(
    "%s exits 0 on garbage stdin",
    (h) => {
      expect(run(h, "not json {{{", repo).code).toBe(0);
      expect(run(h, "", repo).code).toBe(0);
      expect(run(h, { tool_input: 5 }, repo).code).toBe(0);
    },
  );
});
