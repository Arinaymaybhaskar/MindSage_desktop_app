// SessionStart: fetch, then tell the session where its branch stands.
import { readStdinJson, git, currentBranch } from "./lib.mjs";

try {
  const input = await readStdinJson();
  const cwd = input?.cwd || process.cwd();
  const lines = [];
  let fetched = true;
  try {
    git(["fetch", "--quiet", "origin"], cwd, 4000);
  } catch {
    fetched = false;
  }
  const branch = currentBranch(cwd);
  if (!branch) process.exit(0);
  lines.push(
    `Git: on branch ${branch}${fetched ? "" : " (git fetch failed or was offline, so remote state may be stale)"}.`,
  );
  try {
    const counts = git(
      ["rev-list", "--left-right", "--count", "HEAD...@{u}"],
      cwd,
    );
    const [ahead, behind] = counts.split(/\s+/).map(Number);
    lines.push(`Versus its upstream: ${ahead} ahead, ${behind} behind.`);
    if (behind > 0) {
      lines.push(
        "The branch is behind its upstream: per CLAUDE.md, `git pull` (merge, never rebase) before any work.",
      );
    }
  } catch {
    lines.push("No upstream is configured for this branch.");
  }
  if (branch.startsWith("phase/")) {
    try {
      git(["merge-base", "--is-ancestor", "origin/dev", "HEAD"], cwd);
    } catch (e) {
      // status 1 means "not an ancestor"; anything else is not conclusive
      if (e && e.status === 1) {
        lines.push(
          "This phase branch does not contain the latest origin/dev: per CLAUDE.md, merge origin/dev into it (never rebase).",
        );
      }
    }
  }
  lines.push(
    "Rules from CLAUDE.md: branches flow ticket -> phase -> dev -> main, never straight to dev or main.",
    "All work goes through agents with the model chosen from the table in docs/agent/orchestrator.md (instruction only, not enforced by hooks).",
    "Commits carry no Co-Authored-By or Claude-Session trailers.",
  );
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: lines.join("\n"),
      },
    }),
  );
} catch {
  // fail open
}
process.exit(0);
