# Branching, commits, PRs and hooks

Read this before you create a branch, commit, open a PR or merge, and when a hook blocks you.

## Branching and workflow

**Branch flow: ticket branch → phase branch → `dev` → `main`.** `dev` is the beta branch, cut from `main`: every finished phase lands in it through one PR, beta testers run builds of `dev`, and only when they are satisfied does `dev` land in `main` through one PR. `main` therefore only ever holds what beta testers have seen. Merge `main` into `dev` (never rebase it) whenever `main` moves.

`main` is protected on GitHub: no direct pushes (enforced for admins too), no force-pushes, no deletions, and merging requires the `Typecheck & Lint` check to pass, which genuinely means typecheck, lint, `format:check` **and** `npm test` all passing. All work happens on a branch (a ticket branch is cut from its phase branch) and lands via PR.

**Start of every session:** run `git fetch origin` before starting any work, again at least every hour of a long session, and before every merge or push. If the branch is behind its upstream, `git pull` (merge, never rebase) first. Check the Jira status of the ticket before starting, and pick up from the ticket's latest comment. The SessionStart hook does the fetch and reports where the branch stands, but the rule still applies wherever hooks are off (another tool, `--bare`, a fresh clone before trusting project settings).

## Naming: branches, commits and pull requests

Work is tracked in Jira, project **KAN** (MindSage) at arinaymaybhaskar7500.atlassian.net. Every branch, commit and PR that does a ticket names its key, so the work and the ticket find each other. One ticket per branch and per PR.

**Branches:** `<type>/<KEY>-<slug>`, for example `fix/KAN-58-ipc-survives-qdrant` or `feat/KAN-52-trash`.

- `<type>` is the conventional-commit type of the main change: `feat` (user-visible behaviour), `fix` (a bug), `perf`, `refactor`, `test`, `build` (packaging, electron-builder, Vite), `ci`, `chore`, `docs`.
- `<KEY>` is the Jira key in capitals. Work with no ticket drops it: `docs/naming-conventions`. Anything bigger than a typo should get a ticket first.
- `<slug>` is two to five lowercase words joined by hyphens, from the ticket summary.
- Delete both the local and remote branch immediately after merge; don't let merged branches accumulate.
- `phase/p<n>-<slug>` — one per roadmap phase (the Jira release), for example `phase/p1-make-the-promise-true`, cut from `dev` when the phase starts. Ticket branches for that phase branch from it and merge back into it, never straight into `dev` or `main`. When the phase's gate passes (every ticket in Ready for release and the owner's own test done, see [orchestrator.md](orchestrator.md) for the testing loop) and `npm run bench:phase -- <n>` is committed, the phase branch lands in `dev` through one PR. Merge `dev` into an open phase branch (never rebase it) whenever `main` moves. CI runs on every pull request whatever its base, but not on direct pushes to a phase branch, so run typecheck, lint, `format:check` and `npm test` before merging into one by hand.
- `backup/<slug>` — a snapshot taken before a history rewrite or other destructive git operation (e.g. `backup/pre-coauthor-removal`, taken before stripping `Co-Authored-By` trailers from history). Kept indefinitely as cheap insurance.
- `archive/<slug>` — work deliberately abandoned but kept for reference (e.g. `archive/redesign-preview`, a scrapped redesign). Not meant to merge.
- `claude/<slug>` — branches Claude Code creates on its own in cloud sessions. Rename to the pattern above before opening a PR for ticket work.

**Commits:** [Conventional Commits](https://www.conventionalcommits.org/), as the history already uses: `type(scope): summary`.

- `scope` is the area touched, matching the existing history: `startup`, `db`, `auth`, `journal`, `goals`, `search`, `ai`, `chat`, `people`, `media`, `portability`, `settings`, `updater`, `ui`, `bench`. Leave it out when a change spans the app.
- The summary is imperative, lower case, no full stop, under about 72 characters: `fix(startup): keep IPC working when Qdrant fails to start`.
- The body says why, and what was checked. The last line before any trailers is `Refs: KAN-58`; the Jira GitHub integration links commits by that key.
- A breaking change to stored data or IPC gets `!` after the scope (`feat(db)!: …`) and a `BREAKING CHANGE:` line saying what an existing install goes through.
- No `Co-Authored-By` or `Claude-Session` text in a commit message, and never `--no-verify` (a hook blocks both).

**Pull requests:** a ticket PR targets its phase branch, not `main`. Title `KAN-58: <ticket summary>`, for example `KAN-58: IPC survives a Qdrant failure`. The body links the ticket, copies its acceptance criteria as a checklist ticked against what was verified, and lists anything left for a follow-up ticket. A ticket labelled `opus-review` in Jira (journal data, migrations, security, the AI pipeline) is reviewed with Opus before merge.

## Bugs found along the way

When ticket work, a review or a benchmark turns up a bug that is not the ticket's own, do not widen the ticket. File a Jira **Bug** in project KAN under the closest epic, labelled `found-in-phase-<n>` and `phase-<n>-closeout`, with the phase's release as its fix version, a description saying where it was found and whether it was reproduced or only read from the code, and acceptance criteria. Say so in the PR. Closing a phase includes fixing everything labelled `phase-<n>-closeout` (or deliberately moving it to a later release) before the phase branch goes to `main`.

**Functionality first, design later:** a screen's work is split into two tickets. The functionality ticket (behaviour, data, accessibility, tests) is built and verified first. Its look goes in a separate `design-only` Task under the same epic, in the release that brings the new visual system (labels `design-only`, `ui`; today P3), linked from a comment on the functionality ticket. Do not widen the functionality ticket with colours, fonts or layout polish; do not change behaviour in a design ticket.

## Enforced by hooks

Project hooks live in `.claude/settings.json` (committed) and `.claude/hooks/*.mjs`. They are plain Node scripts using only `node:` built-ins, so on Windows, macOS and Linux they run through the Node this repo already requires and need no extra tooling. They fail open: offline, no git or an unreadable command never blocks anything. Tested in `.claude/hooks/hooks.test.mjs` (part of `npm test`).

What they **block** (exit 2, with the rule in the message):
- `git push` to `main` or `dev` in any form (`git push origin HEAD:main`, a bare `git push` while on one of them, `--all`/`--mirror`), and any force-push except `--force-with-lease` on `claude/*` or `backup/*` branches.
- `git commit` whose `-m`, heredoc or `-F` file text contains `Co-Authored-By` or `Claude-Session`, and `git commit --no-verify` / `-n`.
- Edit, Write and NotebookEdit on a file inside the repo while the checked-out branch is `main`, `dev` or `phase/*`: create a `<type>/<KEY>-<slug>` branch first. Files outside the repo (scratchpads) are not affected.

What they only **report**: the SessionStart hook injects the branch, its ahead/behind count and a short reminder of the rules. The UserPromptSubmit hook `context-cap.mjs` injects a handoff warning when the context passes ~150k tokens (see [orchestrator.md](orchestrator.md)).

What stays **instruction-only**, because a hook cannot tell the main session from a subagent and cannot see which model is running: "all work goes through agents", the model choice in the table in [orchestrator.md](orchestrator.md), the testing loop and its Jira statuses, and the commit-message conventions beyond the trailers above. Do not assume a hook will catch a slip there.
