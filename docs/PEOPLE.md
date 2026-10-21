# People

The People section: who the user writes about, how often, and how they tended to feel when they did. The design is the "People section plan" doc (2026-10-15); this file records what was built against it and what is still open.

**The rule the whole feature follows: the AI suggests, code checks, the user confirms.** A small local model will mix people up and pin feelings on the wrong person, so every claim is tied to sentences in the user's own entry, and anything new waits for a yes.

## Where the code is

| Layer | File | What it does |
| --- | --- | --- |
| Schema | [electron/db/migrations.js](../electron/db/migrations.js) v5 `people-tables` | `people`, `person_aliases`, `person_mentions`, `person_summaries`, `people_jobs`, all hanging off an entry or a person by cascading foreign keys. |
| Pure logic | [electron/people/text.js](../electron/people/text.js) | Name normalising, accent-insensitive whole-word search, sentence splitting with offsets, the cheap pre-check, the content hash. |
| | [electron/people/identity.js](../electron/people/identity.js) | Alias resolution, family words across languages (Mum/Amma/Ammi, Papa/Dad, bhai, didi), "same as…?" questions. |
| | [electron/people/extract.js](../electron/people/extract.js) | The extraction prompt, its JSON schema, and the grounding checks on the model's answer. `EXTRACTOR_VERSION` lives here. |
| | [electron/people/insights.js](../electron/people/insights.js) | Feeling trend, summary prompt and grounding, the judgement filter. |
| | [electron/people/people.test.js](../electron/people/people.test.js) | Unit tests for all four. |
| SQL | [electron/db/people.js](../electron/db/people.js) | Every query, scoped by user, with trashed entries filtered out. |
| Queue and IPC | [electron/methods/people.js](../electron/methods/people.js) | Opt-in settings, the background job queue, Ollama calls, the `people:*` handlers. |
| Renderer | [src/pages/people.tsx](../src/pages/people.tsx), [src/pages/personDetail.tsx](../src/pages/personDetail.tsx), [src/components/people/](../src/components/people/) | People list, person page, "Someone new?" inbox, names underlined inside an entry. |

## How an entry becomes a mention

1. `journal:created` or `journal:edited` (emitted by the journal handlers) queues a `people_jobs` row with a hash of the entry text. An unchanged text is a no-op.
2. The queue runs one job at a time in the main process, new and edited entries first, then the backfill newest first. A new entry's job waits up to 3 minutes for its title and mood.
3. **Pre-check, no AI call:** entries under 15 words, or with no known name, relationship word or capitalised name, are skipped.
4. **Extraction:** the prompt lists confirmed people with their nicknames and the ignore list, then the entry as numbered sentences. The model answers in a JSON schema (Ollama's `format`) with sentence numbers, not quotes.
5. **Grounding, in code:** a name must appear in the entry; sentence numbers must exist; a link to a known person stands only for an exact alias; a relationship is kept only when a relationship word is in that person's sentences; ignored names are dropped.
6. **Per-person feelings:** when two or more people share an entry, each person's feeling is re-judged on their own sentences plus one either side.
7. **Identity rules:** an exact alias of one confirmed person links. Anything else attaches to a suggestion, which reaches the inbox after two entries. Near matches (Mum/Amma, Priya/Priya Sharma) and names shared by two confirmed people become "same as…?" questions, never automatic merges.
8. All writes for one entry are one transaction. If the entry changed while the model was working, the result is dropped and the newer job runs instead.

User fixes (nicknames, "wrong person", "not a person", feeling corrections, merges) are stored and go into the next prompt. Verified mentions are never overwritten by a re-run.

## Lifecycle

| Event | What happens |
| --- | --- |
| Entry edited | Text hash changed: unverified mentions are replaced; verified ones are kept, re-anchored, if their name still appears. |
| Entry to Trash / restored | Mentions hidden by every query / back, with no AI call. |
| Entry deleted for good, account deleted | Cascade. |
| AI call fails | Retried with waits of 10s and 40s, then marked failed. "Retry" on the People page re-queues failed jobs. |
| App closes mid-job | `running` jobs go back to `queued` on the next run. |
| Extractor improved | Bump `EXTRACTOR_VERSION`; the next session's backfill re-processes entries. |
| Person merged | Aliases and mentions move; undo is kept in memory for the session. |
| Person deleted / stop tracking | Mentions and summary go. Stop tracking (and delete with the box ticked) keeps the names as an ignore list. |
| People turned off | Optionally deletes every People row for the user. |
| Import, restored backup | Picked up by the once-per-session backfill. Backups are `VACUUM INTO` snapshots, so they carry the People tables. The data export includes them under `people/`, without ignored people and without anything only trashed entries hold. |

## Privacy

- **Off until turned on**, with a one-screen explanation of what it reads, that it stays on this computer, and how to delete it.
- Mentions store character offsets, not copied text, so there is no second copy of the journal. Nothing from People goes into the search index.
- Summaries describe what was written. Lines that read as a verdict or advice (`toxic`, `healthy`, `you should`…) or that cite no entry are dropped in code, and every kept line links to its entries.

## Not done yet

These are in the plan and are not built. The first two are the plan's own preconditions for shipping to users.

- **Encryption at rest** (MASTER_TODO item 18) does not exist. The plan says People never ships before it. Until it does, People data is as protected as the journal itself, which is to say not encrypted.
- **Discreet mode** does not exist in the app, so there is nothing to hide People behind yet.
- **The accuracy test set** (150 labelled entries, a scoring script, the targets table) and **timings on an 8 GB laptop** need hand labelling and a running Ollama. No accuracy number has been measured; nothing here claims one.
- The queue does not yet pause **while the user is typing or Ask is answering**. On battery it lets new entries through and holds the backfill, rather than checking for 30% charge, which Electron's main process cannot read.
- **Changing the chat model** in Settings does not re-run extraction; only an `EXTRACTOR_VERSION` bump does.
- Summaries use the 30 most recent entries rather than summarising month by month and combining.
- No lighter-model switch for 8 GB machines: extraction uses the selected chat model.
