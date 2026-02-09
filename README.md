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

