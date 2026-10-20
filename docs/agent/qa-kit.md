# QA kit

Read this if you test the real app (testing agents, anyone running `scripts/e2e`-style flows). Use `scripts/qa/`. Do not write your own fake Ollama, launcher, byte scanner or process counter.

Setup: `npx vite build` in your worktree, then run scripts under `xvfb-run -a`. As root set `E2E_NO_SANDBOX=1`. On Windows skip `xvfb-run`: run `node your-script.mjs` from a desktop session (the window opens on screen). The kit resolves the electron binary through `require("electron")`, so no path changes are needed; fake-ollama and the process tools are untested there. Write script output to a file and read it with `tail -n 50`.

## Tools (all in `scripts/qa/`)

- `fake-ollama.mjs`: `node scripts/qa/fake-ollama.mjs --port 11434 --log req.jsonl --pid f.pid [--embed-delay-ms 500] [--fail-text WORD] [--tags-hang] [--models a,b] [--title T --mood-score 4 --mood-tags Content,Peaceful] [--answer A --requires-context]`. Also reads `FAKE_OLLAMA_<OPTION>` env vars. Serves `/api/tags`, `/api/embeddings` (768 dims), `/api/generate` (metadata, summary, planning and answer JSON; NDJSON when the app streams). `--fail-text` answers 500 to any request whose prompt holds WORD. `--tags-hang` never answers `/api/tags`. The request log has method, url, model, promptChars, status, never prompt text. Exit 2 if the port is taken (says what answers there).
- `app.mjs`: `import { launchApp, signUp, signIn, writeEntry, waitIndexed, dbRows, timeClose } from "./app.mjs"`. `launchApp({profileDir, env, path, noSandbox})` returns `{app, page}` when the app is ready. `waitIndexed({root, profileDir, entryId})` polls `search_index`. `timeClose(app, ms)` returns ms, or `'hung'` after killing only that app.
- `scan.mjs`: `node scripts/qa/scan.mjs <dir> <needle>...` prints per-file hits as JSON, counting UTF-8 and UTF-16LE. Also `scanDir(dir, needles)`.
- `procs.mjs`: `startTracked(cmd, args, pidfile)`, `stopTracked(pidfile)`, `portTaken(port)`, `waitForPort(port)`, `baseline(/electron/i)` before launch then `newOrphans(base, /electron/i)` after close (empty means clean).
- `overlay.mjs`: `node scripts/qa/overlay.mjs make <worktree>` turns `node_modules` into a directory of symlinks with `sqlite-vec` and its platform package stubbed, so the extension cannot load (search down, journal still opens). Restore with `node scripts/qa/overlay.mjs restore <worktree>`. Always restore.
- `db.cjs`: `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron scripts/qa/db.cjs <db> "<sql>"` prints rows as JSON, read-only.
- Proof it all works: `npm run qa:smoke` prints one PASS or FAIL line.

## Process rules

- Never `pkill`, `killall` or `kill` by name. It kills your own shell and other agents' apps. Start long processes with `startTracked`, stop them with `stopTracked`.
- Kill only pids you started. Never kill something you did not start, even if it holds a port you need.
- The app only talks to port 11434. If another agent or a real Ollama holds it, the fake exits 2: wait and retry with `waitForPort`, or report it. Never kill the holder.
- The sandbox may run in a private network namespace: `ip` and `ss` may be missing and ports are not shared with other sandboxes. Use `portTaken` and `waitForPort`, not `ip`, `ss` or `ps`.
- Always run scripts to completion or into a pid file. End your own scripts with `process.exit(0)`. Remove temp profiles and build output when done.
