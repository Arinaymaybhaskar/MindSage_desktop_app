# Logging

Read this before you add or change any logging in `electron/` or the renderer, or when you need to know what ends up in the log file.

**Logging goes through [electron/log.js](../../electron/log.js) (KAN-170).** Import `{ log }` and call `log.debug/info/warn/error`; do not use `console` in the main process (`electron/noConsole.test.js` fails on it, with a short allowlist that must only shrink). The logger writes `userData/logs/mindsage.log`, rotating at 1 MB across 5 files, keeps the last 500 lines in memory if the folder cannot be written, rate-limits a chatty message, and only keeps `debug` when `MS_DEBUG=1`. [electron/logSetup.js](../../electron/logSetup.js) (imported second in `main.js`) also routes any leftover `console.*` into it.

**Redaction ([electron/logRedact.js](../../electron/logRedact.js)) is a safety net, not permission to log writing:** it removes values under keys such as `content`, `title`, `prompt`, `summary`, `mood_tags`, drops media and journal paths and shortens long strings, but a short free-text string passed on its own cannot be recognised. So log ids, counts and lengths, never entry or chat text.

The renderer's `console.warn`/`console.error` and uncaught errors reach the same file through the single `log:renderer` channel ([src/utils/rendererLog.ts](../../src/utils/rendererLog.ts)). The e2e run checks that no log file contains the entry it wrote (see [tooling-and-tests.md](tooling-and-tests.md)).
