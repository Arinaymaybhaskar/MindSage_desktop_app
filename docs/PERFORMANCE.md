# MindSage — Performance Audit

**Reviewed:** 2026-08-11 · **Scope:** Electron main process, SQLite layer, background worker, IPC/media, React renderer.

This catalogs what actually slows the app down, ranked by impact. Each item has a **severity** (🔴 major · 🟠 moderate · 🟡 minor), the **evidence** (file/line), why it's slow, and the fix.

---

## 1. SQLite — the biggest wins

### 1.1 🔴 No WAL mode / no busy timeout — writers block readers, and concurrent access risks `SQLITE_BUSY`
[electron/db/connection.js:10](../electron/db/connection.js#L10) opens the DB with defaults (`journal_mode = DELETE`, `synchronous = FULL`) and sets only `PRAGMA foreign_keys = ON`. **Two processes open the same file concurrently** — the main process ([connection.js](../electron/db/connection.js)) and the background `Worker` thread ([qdrantWorker.js](../electron/qdrantWorker.js)) each call `new Database(dbPath)`. In `DELETE` journal mode a write takes an exclusive lock, so the worker's sync/embedding writes block every foreground read, and simultaneous writes throw `SQLITE_BUSY` instead of waiting.

**Fix** — right after opening the DB:
```js
db.pragma('journal_mode = WAL');    // readers don't block the writer
db.pragma('synchronous = NORMAL');  // safe with WAL, far fewer fsyncs
db.pragma('busy_timeout = 5000');   // wait instead of throwing on contention
```
This is the single highest-leverage change: faster writes, no read-stalls during background sync, and no busy errors.

### 1.2 🔴 Missing indexes on `journal_entries` — the most-queried table
[connection.js:359-374](../electron/db/connection.js#L359) indexes goals, categories, chats, tags-by-name, and `journal_entry_tags(tag_id)` — but **nothing on `journal_entries`** and **no index on `journal_entry_tags(journal_entry_id)`**. Almost every hot query filters `user_id AND is_deleted` and `LEFT JOIN journal_entry_tags jt ON j.id = jt.journal_entry_id` ([journal.js:141](../electron/db/journal.js#L141), [journal.js:111](../electron/db/journal.js#L111), [dashboard.js](../electron/db/dashboard.js)). With the tag join keyed on the *un-indexed* side, each list/detail/dashboard load does a full scan of both tables — cost grows linearly with entry count.

**Fix** — add:
```sql
CREATE INDEX IF NOT EXISTS idx_je_user_deleted_created ON journal_entries(user_id, is_deleted, created_at);
CREATE INDEX IF NOT EXISTS idx_jet_journal_entry_id   ON journal_entry_tags(journal_entry_id);
```
(Also consider one on `journal_summaries` and `journal_entries(synced_to_qdrant)` for the worker's pending-sync scans.)

### 1.3 🟠 `getAllEntries` defeats its own index with `DATE()` / `DATETIME()`
[journal.js:157-168](../electron/db/journal.js#L157) filters `DATE(j.created_at) >= DATE(?)` and orders by `DATETIME(j.created_at) DESC`. Wrapping the column in a function makes SQLite unable to use any index on `created_at`, so every page fetch scans and re-sorts the user's whole history before applying `LIMIT/OFFSET`. Store/compare `created_at` as plain ISO text and compare the raw column (`j.created_at >= ?`) so the index in 1.2 applies.

### 1.4 🟠 Dashboard recomputes ~8 full-table aggregates on every visit
[dashboard.js:115](../electron/db/dashboard.js#L115) `getUserStats` runs eight separate scans of `journal_entries` (count, word-count `SUM`, min/max dates, a streak CTE with a window function, avg mood, tag ranking, per-weekday averages) — plus `getDashboardData` adds more. None are cached and none hit an index today. Combine the simple ones into a single pass and/or cache the result until the next journal write.

### 1.5 🟡 `ORDER BY RANDOM()` for gallery images
[dashboard.js:41-47](../electron/db/dashboard.js#L41) and the `random` branch of [journal.js:191](../electron/db/journal.js#L191) sort the entire image-bearing set to pick 10. Fine at small scale; for large histories prefer sampling by random offset over an indexed count (the `journal.js` branch already does this — make the dashboard match).

---

## 2. IPC & media — main-thread blocking

### 2.1 🔴 Images/audio/PDF served as base64 via synchronous `readFileSync` on the main process
[media.js:8-71](../electron/db/../methods/media.js#L8) reads each file with **synchronous** `fs.readFileSync` and returns a `data:...;base64,...` string. The dashboard then requests up to 10 images at once ([dashBoard.tsx:317](../src/pages/dashBoard.tsx#L317) `Promise.all` of `media:getImage`), and journal details/chat do the same for audio and PDFs. Two compounding costs:
- **Synchronous disk reads block the main process event loop** — the same thread that services *all* IPC — so the whole UI stalls while files are read.
- **base64 inflates payload ~33%** and forces a large string copy across the IPC boundary per asset.

**Fix** — register a file protocol once (`protocol.registerFileProtocol('media', …)` or `net.fetch` with a custom scheme) and hand the renderer plain `media://…` URLs. The renderer's `<img>` / `<audio>` then streams straight off disk on Chromium's own threads — no main-thread reads, no base64, no giant IPC strings. Convert `getImageBase64` / `getAudioBase64` / `getPdfBase64` accordingly.

---

## 3. Background worker & AI

### 3.1 🟠 Three serialized model calls per new journal
On `journal:created`, [ollama.js:157](../electron/methods/ollama.js#L157) fires one Ollama generation for metadata **and** a *second* listener [ollama.js:200](../electron/methods/ollama.js#L200) fires another for the summary, while the Qdrant worker generates an embedding. That's three model invocations against a single local Ollama instance, which serves requests **serially** — they queue behind each other. Merge metadata + summary into one prompt/call where possible, and be aware the embedding waits its turn.

### 3.2 🟠 `execSync("ollama list")` freezes the main process
[ollama.js:17](../electron/methods/ollama.js#L17) shells out **synchronously** to list models, blocking the main process until Ollama replies (seconds if the daemon is cold). Use async `exec`/`spawn` and `await` it. Only hit from the Model Settings page, so moderate — but it freezes *everything* while open.

### 3.3 🟡 Chatty logging in worker loops + 60s heartbeat
[qdrantWorker.js](../electron/qdrantWorker.js) `console.log`s per journal inside bulk-sync loops ([:538](../electron/qdrantWorker.js#L538), [:560](../electron/qdrantWorker.js#L560), [:582](../electron/qdrantWorker.js#L582)) and posts a heartbeat every 60s ([:691](../electron/qdrantWorker.js#L691)). Minor, but per-item stdout in a large bulk sync adds up; gate behind a debug flag.

---

## 4. React renderer

### 4.1 🟠 Journal list: layout animations on an ever-growing, un-virtualized list
[journalList.tsx](../src/pages/journalList.tsx) renders every card in `<AnimatePresence>` with framer-motion `layout` ([:82](../src/pages/journalList.tsx#L82), [:538](../src/pages/journalList.tsx#L538)). Infinite scroll appends pages and **never unmounts** older cards, so the DOM and the set of layout-animated nodes grow without bound. `layout` forces framer-motion to measure and animate every tracked card on changes — visible jank once a user has scrolled through a few hundred entries. Virtualize (react-window/virtua) or drop `layout` for the list items and keep animation to enter/exit only.

### 4.2 🟡 `useAIStatus` tears down *all* listeners on unmount
[useAIStatus.ts:68](../src/hooks/useAIStatus.ts#L68) cleans up with `removeAllListeners("ai-status-event")`. If two components use the hook, one unmounting kills the other's subscription, and the effect re-subscribes on every `handleAIStatusEvent` identity change. Track and remove the specific handler instead. (Correctness bug with a churn side-effect.)

### 4.3 🟡 Masonry heights randomized inside a memo
[dashBoard.tsx:376](../src/pages/dashBoard.tsx#L376) sets each masonry item's `height` via `Math.random()` inside `useMemo`, so any recompute reshuffles heights and triggers a GSAP re-layout of the whole grid ([masonry.tsx:171](../src/components/masonry.tsx#L171)). Compute height once per image (e.g. derive from the id) so it's stable.

---

## Priority order

| # | Sev | Effort | Action |
|---|-----|--------|--------|
| 1 | 🔴 | S | Enable WAL + `synchronous=NORMAL` + `busy_timeout` in [connection.js](../electron/db/connection.js) |
| 2 | 🔴 | S | Add indexes on `journal_entries(user_id,is_deleted,created_at)` and `journal_entry_tags(journal_entry_id)` |
| 3 | 🔴 | M | Serve media via a custom file protocol instead of synchronous base64 IPC |
| 4 | 🟠 | S | Remove `DATE()/DATETIME()` wrappers in `getAllEntries` so the index is used |
| 5 | 🟠 | S | Make `execSync("ollama list")` async |
| 6 | 🟠 | M | Virtualize the journal list / drop `layout` on list cards |
| 7 | 🟠 | M | Merge per-journal metadata+summary AI calls; cache dashboard stats |
| 8 | 🟡 | S | Fix `useAIStatus` listener cleanup; stabilize masonry heights; gate worker logging |

**Bottom line:** the top three — WAL, the two missing indexes, and killing base64 media over IPC — are small, low-risk changes that remove the main-thread stalls and the scans that get worse as a user's history grows. Everything else is incremental.
