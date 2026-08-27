# MindSage: Architecture and Design Decisions

**Scope:** the *why* behind the technical choices in MindSage. Written for engineers reading the codebase, not for end users. For what the app does, see the [README](../README.md); for what is unfinished, see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

---

## 1. Why Electron over Tauri

**Decision:** Electron (Node.js plus Chromium) over Tauri (Rust plus system WebView).

The core AI pipeline relies on Node.js native bindings, specifically `better-sqlite3` for synchronous SQLite access and a Node wrapper around whisper.cpp. Tauri's backend is Rust, which would have meant either rewriting those integrations or bridging them over IPC. Both add real complexity with no runtime benefit for this use case.

Chromium's consistency also matters. The journal editor uses ContentEditable with custom keyboard handling for autocomplete (<kbd>Tab</kbd> to accept, <kbd>Ctrl</kbd> + <kbd>&rarr;</kbd> to step through). System WebViews on Windows and macOS behave inconsistently with those interactions. Electron gives a guaranteed, reproducible rendering environment.

**Trade-off accepted:** Electron binaries are large. For a privacy-first desktop app whose users are already installing local LLMs measured in gigabytes, that is an acceptable cost. It is not a free one, and [BUNDLE_SIZE_PLAN.md](BUNDLE_SIZE_PLAN.md) tracks getting the installed footprint down.

---

## 2. Why an event-driven architecture for AI tasks

**Decision:** AI operations (transcription, embedding, summarisation, mood scoring) run through an internal event bus and never block the UI thread.

Early prototypes used async/await chains triggered directly from user actions, which caused two distinct problems:

1. **Interface jank.** Whisper transcription of even a short clip takes several seconds. Awaiting that inside a React event handler froze the interface.
2. **Cascade failure.** If Ollama was slow or unavailable, the entire save operation hung or threw, corrupting the optimistic UI state.

The event-driven model decouples user intent from AI processing. Saving a journal emits an event; background workers listening on that event handle transcription and embedding independently. The interface updates optimistically and reflects AI-generated content when it arrives.

The pattern is a lightweight internal message queue, similar in spirit to how a distributed system would use a durable queue or a topic, but scoped to a single Electron process. The consequence to design around is that **AI metadata is never ready synchronously after a create or update**, which is why entries carry an explicit AI status and a retry path rather than a field that is silently blank.

---

## 3. Why Qdrant over ChromaDB or pgvector

**Decision:** Qdrant, running as a bundled binary addressed over HTTP on a free local port.

- **ChromaDB** has a Python-first API. The entire MindSage stack is TypeScript and Node. Its JS client was less stable and its local persistence story less reliable at the time of implementation.
- **pgvector** requires a running PostgreSQL instance. Adding Postgres as a dependency of an offline desktop app with no server is a significant installation burden to push onto users.
- **Qdrant** provides an on-disk persistent vector store with a clean REST API, a good Node client, and runs without Docker. It was the lowest-friction option for a local-first, zero-dependency setup.

**What would change at a different scale:** for a server-deployed version, pgvector inside a managed Postgres instance would be the right call. Fewer moving parts, one database, and SQL joins across structured and vector data. The Qdrant choice is specifically optimised for offline desktop.

---

## 4. Why whisper.cpp instead of cloud speech to text

**Decision:** local whisper.cpp with `ggml-tiny.en.bin` over any cloud speech-to-text API.

This is a journaling app. Audio journals are among the most sensitive data a person generates. Sending voice recordings to a cloud API, from any vendor, is incompatible with the core product promise of zero data egress.

Beyond privacy, cloud speech to text introduces latency variance and requires connectivity. The tiny English model is roughly 75 MB, transcribes a short recording in seconds on a mid-range laptop CPU, and needs no GPU.

The pipeline is:

```
WebM (MediaRecorder API)  ->  FFmpeg  ->  WAV 16 kHz mono  ->  whisper.cpp  ->  text
```

FFmpeg handles container conversion because whisper.cpp expects raw WAV. The conversion adds a small fixed cost and is required regardless of which speech backend sits at the end of the chain.

---

## 5. Why local-only inference

**Decision:** all generation runs through Ollama on the user's machine. There is no cloud model in the desktop application.

An earlier design allowed a configurable cloud fallback for high-complexity synthesis, on the reasoning that small quantised models struggle with long instruction-following tasks such as writing a multi-paragraph goal recommendation from dozens of entries. That path was never wired into the desktop app: the Gemini client exists only inside the unreachable `src/server/` tree ([ONLINE_MODE_REMOVAL.md](ONLINE_MODE_REMOVAL.md)), and the shipping application never sends journal content to an external model.

The offline guarantee is stronger for its absence, and it is simpler to reason about: there is no configuration in which a user's writing can leave the machine through an inference call. The cost is that generation quality is bounded by what the user's hardware can run, which is a trade the product deliberately makes.

---

## 6. Why SQLite for structured data alongside Qdrant for vectors

**Decision:** two stores, SQLite for journals, goals and settings, Qdrant for embeddings, rather than one unified store.

Vector databases are optimised for approximate nearest-neighbour search. They are not optimised for relational queries such as "all journal entries this month with mood score above 7, ordered by date". SQLite answers those in microseconds with standard SQL and no network overhead, because it is an embedded file.

Qdrant stores the embedding vectors and a minimal payload. On a semantic search hit it returns journal IDs, which hydrate into full journal objects from SQLite. This keeps the vector store lean and the query logic in familiar SQL.

The two stores stay in sync through the event bus: creating or updating a journal triggers both the SQLite write and the Qdrant upsert. If the upsert fails, for instance because Ollama is not running, the journal is still saved and the embedding is queued for retry. The user never loses writing because a model was unavailable.

---

## 7. Why nomic-embed-text for embeddings

**Decision:** `nomic-embed-text:v1.5` through Ollama, over any cloud embedding model.

- It runs fully locally through Ollama, consistent with the offline-first constraint.
- It produces 768-dimensional embeddings, which Qdrant handles efficiently.
- Its retrieval quality on short documents is competitive with the common cloud alternatives, and journal entries are short documents.
- It is roughly 274 MB, which is marginal next to the generation model a user has already installed.

An alternative embedding model was evaluated against this one with the benchmark harness rather than by argument; the comparison is recorded in [benchmarks/EMBEDDINGGEMMA.md](benchmarks/EMBEDDINGGEMMA.md) and it was not adopted.

---

## 8. Why no backend server

**Decision:** the Electron main process handles all backend logic. No separate Node server, no REST API.

MindSage is a single-user, single-machine application. The conventional "frontend calls a backend API" architecture exists to handle multi-user access, horizontal scaling, and network separation, none of which apply here.

The main process communicates with the renderer over IPC. All database access, file I/O, and AI orchestration happen in the main process; the renderer is a pure UI layer that never imports a Node API. This keeps deployment simple (one installable binary, no ports, no services), reduces attack surface (no network-exposed API), and removes HTTP round trips from local data access.

**Limitation, stated plainly:** this architecture does not demonstrate distributed systems design. That is a deliberate scope decision. Adding a REST layer would add complexity without value for the actual use case.

---

## 9. What would be built differently at scale

If MindSage were a multi-user hosted product:

- **Replace Electron IPC with a real API layer.** Express or Fastify with typed routes, input validation, and auth middleware.
- **Replace SQLite with PostgreSQL plus pgvector.** Vector similarity inside Postgres removes the dual-database sync problem entirely.
- **Move transcription to a worker queue.** Something like BullMQ backed by Redis, with independently scalable worker processes. The current event bus is single-process by design.
- **Add real observability.** The app logs AI latency and success or failure locally; a hosted version would ship that to a metrics backend, with the collection made explicit and opt-in.
- **Replace local Ollama with a managed inference endpoint.** Same API shape, horizontally scalable.

The local-first architecture is a product constraint, not a capability constraint. Every decision above is reversible at a seam that already exists.
