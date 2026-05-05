# <img src="./assets/iconDark.png" alt="MindSage Logo" width="28" style="vertical-align: middle;"/> MindSage — Offline-First AI Journaling App

MindSage is a **privacy-first, offline AI journaling application** that helps users reflect, track emotions, and grow through writing and voice — **entirely on their own device**.

There is **no required internet connection**, no usage analytics, and no data leaving your machine.

---

## Download

### Windows (Desktop App)
- 👉 [Download MindSage for Windows](https://github.com/Arinaymaybhaskar/MindSage_desktop_app/releases/download/v0.1.0-win/MindSage.Setup.1.0.0.exe)

> ⚠️ Windows may show a SmartScreen warning because the app is not code-signed yet.  
> Click **More info → Run anyway** to continue.

> MindSage runs fully offline by default.  
> All journals, audio, embeddings, and AI outputs stay on your device.

---

## Core Principles

- **Offline-first by design**
- **No tracking or analytics**
- **Local AI, local storage**
- **User owns 100% of their data**

MindSage measures progress and patterns **only for the user**, never across users.

---

## Technologies

### Frontend
- React (Vite)
- TypeScript
- TailwindCSS
- Lucide-react
- react-router-dom

### Desktop
- Electron
- EventBus-based event-driven architecture

### Local Storage
- SQLite3 (journals, goals, settings)
- Local vector database (semantic search)

### AI & Processing (Local)
- Ollama (local LLMs)
- Whisper.cpp (`ggml-tiny.en.bin`)
- FFmpeg (WebM → WAV audio conversion)
- Local embeddings:
  - `nomic-embed-text`

---

## Features

### 1. Journals

- Create / Edit / Delete journal entries
- Fields:
  - Title
  - Content
  - Mood score
  - Mood tags
  - Images
  - Audio recordings
- Journal detail view:
  - Sentiment score
  - Mood emoji
  - Created / updated timestamps
  - Attached media
- Search journals:
  - Keyword search
  - Semantic search (local embeddings)
- Filter by date

#### AI-Powered Enhancements (Local)
- Automatic title generation
- Auto mood score & mood tags
- Concise AI summaries (EDA-based)

---

### 2. Dashboard

- **Pinned Goals** with progress visualization
- **Mood & Sentiment Charts**
  - Weekly / Monthly views
- **Key Indicators**
  - Entries this month
  - Time since last entry
- **Recent Entries**
- **Image Gallery**
  - Masonry layout from journal images

---

### 3. Goals & Ambitions

- Manual goal creation
- AI-assisted goal generation from high-level ambitions
- Progress logging with notes
- Goal categories with custom colors
- Pin important goals to dashboard
- Mark goals as completed
- Reflection view with progress charts for completed goals

---

### 4. Voice & Audio Journals

#### Live Speech-to-Text
- Real-time transcription into journal editor
- No audio conversion required

#### Audio Journal Recording
- Audio recorded and stored locally as **WebM**
- Offline transcription pipeline:
  1. Journal created event emitted
  2. Audio retrieved from local storage
  3. WebM → WAV conversion via FFmpeg
  4. Transcription using Whisper.cpp
  5. Journal entry updated with transcript
- Audio playback and transcript shown together in journal details

---

### 5. AI Assistant

- Context-aware chatbot grounded in **your own journals**
- Answers reference relevant entries
- No external knowledge injection
- Local Retrieval-Augmented Generation (RAG)

---

### 6. Autocomplete & Writing Assistance

- Lightweight local model for autocomplete
- Keyboard-driven flow:
  - **Tab** → accept suggestion
  - **Ctrl + →** → step through suggestion word-by-word

---

### 7. Daily Challenge

- Daily reflective challenges
- Accept challenges before 8 PM
- Upload local proof images
- Track challenge streaks

---

### 8. Settings

- Profile customization
- Appearance & theme preferences
- Model configuration
- Local data export (journals, media)

---

## System Workflows

### Journal Management

**Create Journal Flow**  
![Create Journal Flow](./assets/diagrams/createJournal.png)

**Update Journal Flow**  
![Update Journal Flow](./assets/diagrams/updateJournal.png)

**Delete Journal Flow**  
![Delete Journal Flow](./assets/diagrams/deleteJournal.png)

---

### Goal Management

**AI-Assisted Goal Creation**  
![AI Goal Creation Flow](./assets/diagrams/CreateGoal.png)

**Goal Actions (Progress, Update, Complete)**  
![Other Goal Actions Flow](./assets/diagrams/otherGoalActions.png)

---

### Search & AI Chat

**Semantic Search Flow**  
![Semantic Search Flow](./assets/diagrams/semanticSearch.png)

**Conversational AI Chat Flow**  
![Chat Flow](./assets/diagrams/chat.png)

---

## Screenshots

### Dashboard & Core Pages
![Dashboard](./public/screenshots/dashboard.png)
![Goals Page](./public/screenshots/goalsPage.png)
![My Journals](./public/screenshots/myjournals.png)

### Journal & AI Features
![New Journal](./public/screenshots/newJournal.png)
![Journal Details](./public/screenshots/journalDetails.png)
![Chat Bot](./public/screenshots/ChatBot.png)

---

## Technical Notes

- Event-driven background workers for AI tasks
- All AI runs asynchronously and never blocks UI
- Local observability for:
  - AI latency
  - Task success/failure
  - Output consistency
- No telemetry leaves the device

---

## Roadmap

- Improved semantic search ranking
- Deeper personal analytics (on-device only)
- Additional local models
- Export to Markdown / PDF
- UI polish and performance tuning

---

## Philosophy

MindSage does not track users.  
It helps users track themselves.

All insights, metrics, and patterns are computed **locally**, compared **only against your own history**, and never aggregated across users.

---

# MindSage — Architecture & Design Decisions

> This document explains the *why* behind the technical choices in MindSage. It's written for engineers reviewing the codebase, not end users.

---

## 1. Why Electron over Tauri?

**Decision:** Electron (Node.js + Chromium) over Tauri (Rust + system WebView).

**Reasoning:**

The core AI pipeline in MindSage relies on Node.js native bindings — specifically `better-sqlite3` for synchronous SQLite access and a Node.js wrapper for Whisper.cpp. Tauri's backend is Rust, which would have required either rewriting those integrations in Rust or bridging through IPC, both of which added significant complexity without clear runtime benefits for this use case.

Chromium's consistency also matters here. The journal editor uses ContentEditable with custom keyboard handling for autocomplete (Tab to accept, Ctrl+→ to step through). System WebViews on Windows and macOS behave inconsistently with these interactions. Electron gave a guaranteed, reproducible rendering environment.

**Trade-off acknowledged:** Electron binaries are large (~150MB). For a privacy-first desktop app targeting power users who care enough to install local LLMs (~4–8GB each), this is an acceptable trade-off. Users who want MindSage are already running Ollama.

---

## 2. Why event-driven architecture for AI tasks?

**Decision:** AI operations (transcription, embedding, summarization, mood scoring) run via an internal EventBus and never block the UI thread.

**Reasoning:**

Early prototypes used async/await chains triggered directly from user actions. This caused two problems:

1. **UI jank** — Whisper.cpp transcription on even a small audio clip takes 2–8 seconds. Awaiting that in a React event handler froze the interface.
2. **Cascade failures** — If Ollama was slow or unavailable, the entire save operation would hang or throw, corrupting the optimistic UI state.

The event-driven model decouples user intent from AI processing. When a journal is saved, the app emits `journal:created`. Background workers listening to that event handle transcription and embedding independently. The UI updates optimistically and later reflects AI-generated content when it arrives.

This mirrors how production systems handle async side effects — the pattern is essentially a lightweight internal message queue, similar in spirit to how you'd use SQS or a Kafka topic in a distributed system, but scoped to a single Electron process.

---

## 3. Why Qdrant over ChromaDB or pgvector?

**Decision:** Qdrant (in-process via HTTP) over ChromaDB or pgvector.

**Reasoning:**

- **ChromaDB** has a Python-first API. The entire MindSage stack is TypeScript/Node.js. While ChromaDB has a JS client, it was less stable and the local persistence story was less reliable at the time of implementation.
- **pgvector** requires a running PostgreSQL instance. Adding Postgres as a dependency for an offline desktop app with no server would have been a significant installation burden for users.
- **Qdrant** provides an on-disk persistent vector store with a clean REST API, a good Node.js client, and runs without Docker in an embedded mode. It was the lowest-friction option for a local-first, zero-dependency setup.

**What I'd change:** For a server-deployed version, pgvector inside a managed Postgres instance would be the right call — fewer moving parts, one database, SQL joins across structured and vector data. The current Qdrant choice is specifically optimised for offline desktop.

---

## 4. Why Whisper.cpp instead of cloud STT (Whisper API / Google STT)?

**Decision:** Local Whisper.cpp (`ggml-tiny.en.bin`) over any cloud speech-to-text API.

**Reasoning:**

This is a journaling app. Audio journals are among the most sensitive personal data a person generates. Sending voice recordings to a cloud API — even OpenAI's — is incompatible with the core product promise of zero data egress.

Beyond privacy, cloud STT introduces latency variance and requires an internet connection. The `ggml-tiny.en.bin` model (~75MB) achieves >95% word accuracy on clear audio and completes transcription of a 2-minute recording in under 10 seconds on a mid-range laptop CPU with no GPU required.

The pipeline is:
```
WebM (MediaRecorder API) → FFmpeg → WAV (16kHz mono) → Whisper.cpp → text
```

FFmpeg handles the container conversion because Whisper.cpp expects raw WAV. The conversion adds ~200ms but is required regardless of which STT backend you use.

---

## 5. Why hybrid cloud/local inference instead of local-only?

**Decision:** Ollama for local inference by default, with Google Gemini as a configurable cloud fallback.

**Reasoning:**

Local models (`llama3`, `mistral`, etc.) run well for retrieval-augmented responses where the context is short and the task is pattern-completion. They struggle with longer synthesis tasks — writing a multi-paragraph goal recommendation from 50 journal entries, for example, requires a model with strong instruction-following that the tiny/small quantised models don't reliably provide.

The hybrid approach lets users stay fully offline for day-to-day features (mood scoring, autocomplete, semantic search) while optionally delegating high-complexity tasks to Gemini when they choose to enable it. The fallback is explicit and user-controlled — the app never silently sends data to a cloud API.

This also de-risks the product. If a user's machine can't run local models (low RAM, no GGUF support), the app degrades gracefully to cloud-only rather than being non-functional.

---

## 6. Why SQLite for structured data alongside Qdrant for vectors?

**Decision:** Two separate stores — SQLite3 for journals/goals/settings, Qdrant for embeddings — rather than a single unified store.

**Reasoning:**

Vector databases are optimised for ANN (approximate nearest-neighbour) search. They are not optimised for relational queries like "all journal entries this month with mood score > 7, ordered by date." SQLite handles these queries in microseconds with standard SQL, with zero network overhead since it's an embedded file.

Qdrant stores the embedding vectors and a minimal payload (`{ journal_id, created_at }`). On a semantic search hit, Qdrant returns journal IDs, which are then used to hydrate full journal objects from SQLite. This keeps the vector store lean and the query logic in familiar SQL.

The two databases stay in sync via the EventBus — when a journal is created or updated, an event triggers both the SQLite write and the Qdrant upsert. If the Qdrant upsert fails (e.g., Ollama is not running), the journal is still saved and the embedding is queued for retry.

---

## 7. Why nomic-embed-text for embeddings?

**Decision:** `nomic-embed-text` via Ollama over OpenAI `text-embedding-ada-002` or other cloud embedding models.

**Reasoning:**

- Runs fully locally via Ollama, consistent with the offline-first constraint.
- Produces 768-dimensional embeddings, which Qdrant handles efficiently.
- Benchmark quality (MTEB scores) is competitive with `ada-002` on short document retrieval tasks — journal entries are short documents.
- The model is ~274MB, which is trivial given that the smallest useful Ollama LLM is already 4GB.

---

## 8. Why no backend server?

**Decision:** Electron main process handles all "backend" logic. No separate Node.js server, no REST API.

**Reasoning:**

MindSage is a single-user, single-machine application. The conventional "frontend calls a backend API" architecture exists to handle multi-user access, horizontal scaling, and network separation — none of which apply here.

The Electron main process communicates with the renderer (React) via IPC (`ipcMain` / `ipcRenderer`). All database access, file I/O, and AI orchestration happens in the main process. The renderer is a pure UI layer.

This keeps the deployment model simple (one installable binary, no ports, no services), reduces attack surface (no network-exposed API), and eliminates the latency of HTTP roundtrips for local data access.

**Limitation:** This architecture doesn't demonstrate distributed systems design. That's a conscious scope decision — MindSage is explicitly a local app, and over-engineering it with a REST layer would add complexity without value for its actual use case.

---

## 9. What I'd build differently at scale

If MindSage were a multi-user SaaS:

- **Replace Electron IPC with a proper API layer** — Express or Fastify with typed routes, input validation, auth middleware.
- **Replace SQLite with PostgreSQL + pgvector** — pgvector handles vector similarity search inside Postgres, eliminating the dual-database complexity.
- **Move Whisper transcription to a worker queue** — e.g., BullMQ backed by Redis, with separate worker processes. The current EventBus is single-process; at scale, transcription workers would need to be independently scalable.
- **Add observability** — the app currently logs AI latency and success/failure locally. In production, this would feed into something like Datadog or a self-hosted Grafana stack.
- **Replace local Ollama with a managed inference endpoint** — e.g., Fireworks AI, Together AI, or a self-hosted vLLM cluster. Same API shape, horizontally scalable.

The local-first architecture of MindSage is a product constraint, not a capability constraint. The design decisions above are all reversible at the seam points.

---

