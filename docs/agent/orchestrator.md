# Orchestrator guide

Read this if you are the ORCHESTRATING session (the main session that talks to the owner and launches agents). Subagents do not need it unless their brief says so. It holds the full delegation plan, the testing loop, the Jira conventions and the brief template.

Related docs: [workflow.md](workflow.md) (branches, commits, PRs, hooks), [tooling-and-tests.md](tooling-and-tests.md) (commands and checks).

## Start of every session

Run `git fetch origin` before starting any work, again at least every hour of a long session, and before every merge or push. If the branch is behind its upstream, `git pull` (merge, never rebase) first. Check the Jira status of the ticket before starting, and pick up from the ticket's latest comment. The SessionStart hook does the fetch and reports where the branch stands, but the rule still applies wherever hooks are off (another tool, `--bare`, a fresh clone before trusting project settings).

## Branch flow and the owner pass

**Branch flow: ticket branch → phase branch → `dev` → `main`.** `dev` is the beta branch, cut from `main`: every finished phase lands in it through one PR, beta testers run builds of `dev`, and only when they are satisfied does `dev` land in `main` through one PR. `main` therefore only ever holds what beta testers have seen. Merge `main` into `dev` (never rebase it) whenever `main` moves.

Nobody pushes or edits directly on `main`, `dev` or `phase/*` (hooks enforce it, see [workflow.md](workflow.md)). Full branch, commit and PR naming is in [workflow.md](workflow.md).

The phase branch lands in `dev` when the phase's gate passes: every ticket in Ready for release, the owner's own test done (step 6 below), and `npm run bench:phase -- <n>` committed (see [tooling-and-tests.md](tooling-and-tests.md)). Later `dev` goes to `main`, after the beta testers.

## The testing loop (Jira statuses)

A ticket that is built and merged into its phase branch goes to **Ready for testing**, never straight to Done. Done means verified by a person and merged to `main`. From there:

1. **Test.** A *separate* testing agent (never the one that wrote the code, and given only the ticket and its QA-steps comment) launches the real app (`xvfb-run` and Playwright, `MS_REMOTE_DEBUG` or the dev app for debug mode; `scripts/e2e/run.mjs` is the pattern; on Windows there is no `xvfb-run`, so run the same Playwright flow against the app in a normal window) and works through the ticket's acceptance criteria and QA steps in the UI, thoroughly, including the edge cases the ticket lists. It cannot pass what the sandbox cannot do (no real Ollama, no Windows or macOS packaged build): those parts are reported as not tested, and a ticket labelled `needs-hardware` stays in Ready for testing with the parts that could run recorded in a comment.
2. **Pass.** Everything that can be checked passed: move the story to **Ready for release** and comment exactly what was run and seen.
3. **Fail.** Move the story to **Failed Testing** and file a Jira **Bug** under the same epic with the repro steps, evidence (screenshot, log lines) and what was expected, labelled `release-pN`, `found-in-phase-N` and `phase-N-closeout`, with the phase's release as fix version and linked to the story.
4. **Fix.** The coding agent reads the bug, fixes it on a branch named for the bug (`fix/KAN-nnn-slug`), merges it into the phase branch, and moves **both the bug and the story back to Ready for testing**, with a comment saying what changed and what to retest.
5. **Retest.** The testing agent tests the bug and the story again and sets each status accordingly. Repeat 3 to 5 until every ticket of the phase is in Ready for release.
6. **Owner pass.** The coding agent writes, per ticket, what to test and how (the QA-steps comment, kept current, with what is automated and what is not). The owner tests from those instructions. Only then does the phase branch go to `dev` (and later `dev` to `main`, after the beta testers).

Rules that keep the loop honest: a tester reports what it saw, not what the code intends; a pass never rests on unit tests alone; a bug found in a ticket's own acceptance criteria is the ticket's (it goes to Failed Testing), a bug found elsewhere is filed separately and the ticket may still pass; statuses are changed only by the agent whose step it is.

## Who does the work: delegation and model selection

The goal is to spend tokens where a mistake is expensive and nowhere else. **All work goes through agents** (the `Agent` tool, with its `model` parameter set explicitly). The main session only orchestrates: it reads the Jira state, writes each agent's brief, merges and pushes what the agents return, and talks to the owner. It does not write feature code, run the test loop, review diffs or do Jira bookkeeping itself. The only things done inline are single-command facts (a `git status`, one status check) where writing a brief would cost more than the answer.

| Work | Model | Effort | Notes |
|---|---|---|---|
| High-risk coding: migrations, the search indexer, anything touching the journal database or its backups, security, the AI pipeline (tickets labelled `opus-review`) | `opus` (`fable` when the owner asks for the strongest) | `high` | A mistake loses or leaks journal text. |
| Everyday coding: UI behaviour, handlers, tests, bug fixes | `sonnet` | `medium` | The default coding agent. |
| Testing agents (the loop above) | `sonnet`; `opus` for `opus-review` tickets | `medium`; `high` for `opus-review` tickets | Reports what it saw, never what the code intends. |
| Diff review before a phase branch merges | `opus` | `high` | Never the model session that wrote the code. |
| Planning, re-planning phases, moving tickets between releases | `opus` | `high` | A wrong call multiplies across tickets. |
| Mechanical chores: Jira status moves, comments, filing bugs from the template, reformatting, grep-and-report | `haiku` | `low` | Nothing subtle to get wrong. |

Rules:
- **Risk decides the tier, not size.** A one-line migration change goes to `opus`; a large UI change can go to `sonnet`.
- **Author and judge are different agents.** The agent that wrote a change never tests or reviews it.
- **Escalate on failure.** If a `sonnet` fix fails retest twice, the bug goes to `opus` instead of a third try (see the effort rule below for the order).
- **Effort is set explicitly too.** Every agent is launched with the `effort` parameter from the table (`low`, `medium`, `high`, `xhigh`, `max`); this file is the standing instruction that allows setting it. Effort rises before the model does: a failed `sonnet` fix is retried once at `high` before escalating to `opus`, and an `opus` fix that fails is retried at `xhigh`. Use `xhigh` or `max` only for migrations, data-loss risks and security findings, never for routine work.
- **Brief like a peer.** Each brief names the ticket key and branch, the files that matter, what is already ruled out, the checks to run (`typecheck`, `lint`, `format:check`, `npm test`, `npm run test:db`), the commit rules in [workflow.md](workflow.md) (conventional commit, `Refs: KAN-nn`, no `Co-Authored-By` or session trailers), and asks for a short report: what changed, what was checked, what was not. Agents do not touch Jira statuses unless their step in the loop says so.
- **Parallel where independent.** Tickets that touch different files run as separate agents in one batch, each in its own worktree (`isolation: "worktree"`) when they could collide. Do not run several agents on the same files.
- **Keep the main context small.** Ask for summaries, not file dumps, and do not re-read what an agent already reported. Do not start an agent for something a single grep answers.
- **Verify before relaying.** An agent's report is a claim: the orchestrator checks the commit exists and the checks it names were run before it moves a ticket or tells the owner it is done, and says plainly what was not verified.

## Reporting and token rules

- The orchestrator's own messages to the owner follow [terse-output.md](terse-output.md). Tell the owner at most 2-3 short lines after any action. Never recap tables or per-ticket detail unless the owner asks for progress.
- Briefs ask agents for reports of at most 10 lines in the [terse-output.md](terse-output.md) style: verdict, commit hash, what was NOT verified. Agents give evidence as pass/fail plus the one number that matters, not narration.
- No agent re-reads files already reported. No agent starts for a single grep. Batch related tickets per agent.

## Jira conventions

Work is tracked in Jira, project **KAN** (MindSage) at arinaymaybhaskar7500.atlassian.net. Every branch, commit and PR that does a ticket names its key. One ticket per branch and per PR.

- **Phases are Jira releases (fix versions).** Each roadmap phase P1, P2, ... is one release (one release per phase); tickets and bugs of a phase carry that release as fix version and a `release-pN` label.
- **Statuses:** Ready for testing, Testing, Failed Testing, Ready for release, Done (see the testing loop above for who moves a ticket and when).
- **Labels:** `opus-review` (journal data, migrations, security, the AI pipeline: reviewed with Opus before merge and tested at higher effort); `needs-hardware` (cannot be fully tested in the sandbox; stays in Ready for testing with the parts that could run recorded in a comment); `found-in-phase-<n>` and `phase-<n>-closeout` (bugs, see below); `release-pN`; `design-only`, `ui` (design tickets).
- **Bug filing template.** When ticket work, a review or a benchmark turns up a bug that is not the ticket's own, do not widen the ticket. File a Jira **Bug** in project KAN under the closest epic, labelled `found-in-phase-<n>` and `phase-<n>-closeout` (plus `release-pN` for a bug found in the testing loop), with the phase's release as its fix version, a description saying where it was found and whether it was reproduced or only read from the code, and acceptance criteria. For a bug from a failed test, also give the repro steps, evidence (screenshot, log lines) and what was expected, and link it to the story. Say so in the PR. Closing a phase includes fixing everything labelled `phase-<n>-closeout` (or deliberately moving it to a later release) before the phase branch goes to `main`.
- **Functionality first, design later.** A screen's work is split into two tickets. The functionality ticket (behaviour, data, accessibility, tests) is built and verified first. Its look goes in a separate `design-only` Task under the same epic, in the release that brings the new visual system (labels `design-only`, `ui`; today P3), linked from a comment on the functionality ticket. Do not widen the functionality ticket with colours, fonts or layout polish; do not change behaviour in a design ticket.

Hooks cannot tell the main session from a subagent and cannot see which model is running, so "all work goes through agents", the model table above, the testing loop and its Jira statuses stay instruction-only. Do not assume a hook will catch a slip there.

## Brief template for subagents

Every brief states:

1. Ticket key and branch (`<type>/<KEY>-<slug>`, cut from the phase branch), and the phase branch it merges back into.
2. Which `docs/agent/` files to read (use the table below; every agent cites [terse-output.md](terse-output.md); coding agents also cite [ponytail.md](ponytail.md)) and which to skip. Subagents read only those plus `CLAUDE.md`.
3. The files that matter, and what is already ruled out.
4. The checks to run: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, and `npm run test:db` when the database or indexer is touched.
5. Commit rules: Conventional Commits, `Refs: KAN-nn` as the last line before trailers, no `Co-Authored-By` or `Claude-Session` text, no `--no-verify`, no model names.
6. Report format: at most 10 lines: verdict, commit hash, what was NOT verified; evidence as pass/fail plus the one number that matters. Whether the agent may touch Jira statuses (only if its step in the testing loop says so).

## Which docs/agent files to cite in a brief

| Kind of work | Cite |
|---|---|
| Any coding ticket | [ponytail.md](ponytail.md), [workflow.md](workflow.md), [tooling-and-tests.md](tooling-and-tests.md) |
| Renderer or IPC handler work | [architecture.md](architecture.md) |
| Search, indexer, embeddings, Ask | [search-index.md](search-index.md), [architecture.md](architecture.md) |
| Trash, purge, delete profile, backups | [trash-and-deletion.md](trash-and-deletion.md), [search-index.md](search-index.md) |
| Sign-in, session, CSP, windows, installer | [security-and-session.md](security-and-session.md) |
| Import/export, updates, support lines, env flags, packaging | [features.md](features.md) |
| Logging | [logging.md](logging.md) |
| Testing agent | the ticket and its QA-steps comment only, plus [tooling-and-tests.md](tooling-and-tests.md) (e2e) |
| Diff review | [workflow.md](workflow.md) plus the file for the area changed |
| Migrations or anything in `electron/db/` | [architecture.md](architecture.md) (schema rules), [trash-and-deletion.md](trash-and-deletion.md), [search-index.md](search-index.md) |
