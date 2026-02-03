# <img src="./assets/iconDark.png" alt="MindSage Logo" width="28" style="vertical-align: middle;"/> MindSage – Features & Platforms

MindSage is an AI-powered journaling platform that helps users reflect, track emotions, and grow through writing and voice.
It runs on ** Website** and ** Desktop App** (offline-first with sync).

---

## Technologies

### Frontend

- React (Vite)
- TypeScript
- TailwindCSS
- Lucide-react
- react-router-dom

### Backend

- Node.js + Express
- JWT Authentication
- Bcrypt (password encryption)
- Nodemailer (emails)

### Database

- PostgreSQL (AWS RDS)
- AWS S3 (media storage)
- Qdrant Cloud (vector DB)
- SQLite3 (desktop local storage)

### AI & Processing

- Gemini
- Ollama (local models)
- Whisper.cpp (local transcription with `ggml-tiny.en.bin`)
- FFmpeg (audio conversion: WebM → WAV)
- RAG with embeddings:
  - `text-embedding-004`
  - `nomic-embed-text` (local)

### Desktop

- Electron with EventBus (event-driven architecture)

---

##  Website Features

### 1.  Authentication

- Login (username/email + password, “remember me”)
- Register (unique username, full name, email, password)
- Reset password (OTP email, no old password required)
- Change password (with old password)
- Delete account (two confirmations + password)
- Google login (temporary encrypted password)
- Logout

---

### 2.  Dashboard

- **Pinned Goals:** Displays pinned goals with a visual progress percentage.
- **Mood & Sentiment Chart:** A line chart visualizing mood and sentiment scores over time, with options to view data for the **last week** or **last month**.
- **Key Metrics:**
  - **Entries This Month:** A count of journal entries in the current month.
  - **Last Entry:** Shows the time elapsed since the last journal entry (e.g., "2 days ago").
- **Recent Entries:** A list of your most recent journal entries with direct links for quick access.
- **Image Gallery:** A masonry-style gallery of random images from your journals, with each image linking to its respective entry.

---

### 3.  Journals

- Create / Edit / Delete entries
- Journal fields: Title, Content, Mood score, Mood tags, Image, Audio
- Journal detail view: sentiment score, emoji (based on mood), created/updated dates, media
- Search journals (keyword; semantic planned)
- Filter by date

**AI-Powered Enhancements**

- **Automatic Title Generation:** AI suggests a title in the background.
- **Auto Mood Score & Tags:** AI extracts mood signals + relevant tags.
- **AI Summaries (EDA-based):** Generates concise summaries of journal entries.

---

### 4.  Goals & Ambitions

- **Goal Creation:**
  - **Manual Mode:** Create a goal by manually filling in the name, description, target date, target value, and target unit.
  - **AI-Powered Ambitions:** Provide a high-level ambition (e.g., "I want to be healthier"). The AI will generate 2-3 specific goal templates (e.g., "Exercise 3 times a week," "Drink 8 glasses of water daily"). You can then edit, delete, or add these goals with a single click.
- **Progress Logging:** Log your progress towards a goal with a value and a descriptive comment.
- **Goal Management:**
  - View all active and completed goals on the goals page.
  - **Pin** important goals to the dashboard.
  - **Edit**, **Delete**, or mark goals as **Complete**.
- **Categories:** Organize goals with custom categories, each with its own unique color for easy filtering.
- **Reflection:** For completed goals, a "See Reflection" button reveals a progress chart to visualize your journey.

---

### 5.  Voice & Audio Journals

- **Live Speech-to-Text:**
  - Transcribes speech directly into the journal textarea in real-time.
  - Does **not** require audio conversion.
- **Audio Journal Recording:**
  - User records and saves audio → stored locally as **WebM file**.
  - **Whisper service flow:**
    1. Journal created event is emitted (via EventBus).
    2. Whisper service retrieves WebM file from saved location.
    3. Converts WebM → WAV (using FFmpeg).
    4. Transcribes audio via Whisper.cpp (`ggml-tiny.en.bin`).
    5. Updates journal entry with the transcription.
  - Transcription appears in the **journal details page** alongside audio.

---

### 6.  Daily Challenge

- Accept challenges before 8 PM.
- Upload proof (image).
- Track challenge streaks.
- (Future) Choose challenge type.

---

### 7.  Settings

- **Profile:**
  - Update full name, username, and email.
  - Upload/change profile photo.
- **Privacy & Security:**
  - Change password (requires old password).
  - Delete account (requires two confirmations + password).

---

### 8.  AI Features

- Follow-up questions (3 prompts based on entry).
- Chatbot (answers based on journals, with links).
- **Autocomplete (Lightweight AI Model):**
  - Suggests completions while typing.
  - **Tab** → accept suggestion.
  - **Ctrl + →** → move word by word through suggestion.
- **AI Transcription:**
  - Live transcription (speech-to-text into textarea).
  - Recorded audio transcription (via FFmpeg + Whisper.cpp).

---

##  Desktop App

The desktop app supports **all website features** + **offline-first architecture**:

- Local database (users, journals, settings).
- Local vector DB for embeddings.
- Local AI model for generation.
- Device-based media uploads.

###  Online Sync

Users can switch online to:

- Register & authenticate.
- Sync all data.
- Cloud embeddings (Qdrant).
- Cloud AI generation.
- Cloud media storage (S3).

Executable available via the MindSage website.

---

## System Workflows

This section provides a visual overview of the core processes and data flows within the MindSage application.

### Journal Management

**1. Create Journal Flow**
_This diagram illustrates the process when a user creates a new journal entry, including the conditional logic for handling audio attachments and transcription._
![Create Journal Flow](./assets/diagrams/createJournal.png)

**2. Update Journal Flow**
_This shows how the system handles updates to an existing journal. The flow branches based on the type of data being changed (content, mood, audio) and triggers different backend processes like re-embedding or re-transcription._
![Update Journal Flow](./assets/diagrams/updateJournal.png)

**3. Delete Journal Flow**
_This diagram details the steps for deleting a journal entry, ensuring that records are removed from the SQLite database, the vector store (Qdrant), and the file system (for images/audio)._
![Delete Journal Flow](./assets/diagrams/deleteJournal.png)

### Goal Management

**1. AI-Assisted Goal Creation**
_This flow outlines how a user's high-level ambition is transformed into concrete, actionable goals by the AI. It includes a retry mechanism for AI model calls and a manual fallback option._
![AI Goal Creation Flow](./assets/diagrams/CreateGoal.png)

**2. Goal Actions (Add Progress, Update, Delete, Complete)**
_This diagram covers the various CRUD operations for goals, such as logging progress, updating goal details, deleting a goal entirely, and marking it as complete._
![Other Goal Actions Flow](./assets/diagrams/otherGoalActions.png)

### Data Synchronization & Processing

**1. Manual Sync Initiation**
_This shows the initial frontend and backend steps when a user manually triggers a bulk sync of their journals to the cloud._
![Manual Sync Flow](./assets/diagrams/bulkSync.png)

**2. Background Worker & Sync Process**
_This diagram details the asynchronous worker process that handles the heavy lifting of data synchronization. It periodically checks for pending journals, performs AI enrichment (summaries, tags), generates embeddings, and updates the sync status._
![Background Worker Flow](./assets/diagrams/worker.png)

### Search & AI Chat

**1. Semantic Search Flow**
_This workflow details the process for semantic search. A user's query is vectorized and used to find the most relevant journal entries from the Qdrant vector database. The results are then re-ranked by a local LLM (Ollama) to improve relevance before being returned. If no semantic matches are found, the system falls back to a traditional keyword search._
![Semantic Search Flow](./assets/diagrams/semanticSearch.png)

**2. Conversational AI Chat Flow**
_This diagram illustrates the RAG (Retrieval-Augmented Generation) pipeline for the conversational chatbot. It uses LangChain for context management and classifies user queries to determine if retrieval from journals is needed. The system can handle time-based questions, retrieves relevant context from Qdrant, and uses Ollama to generate a conversational response grounded in the user's data._
![Chat Flow](./assets/diagrams/chat.png)

---

## Screenshots

### Dashboard & Core Pages

|                                                                             |                                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ![Dashboard](./public/screenshots/dashboard.png)                            | ![Dashboard Alternative](./public/screenshots/dashboard_2.png) |
| **Dashboard** - Overview with pinned goals, mood charts, and recent entries | **Dashboard Alternative View**                                 |
| ![Settings](./public/screenshots/settingsPage.png)                          | ![Goals Page](./public/screenshots/goalsPage.png)              |
| **Settings Page** - User preferences and configuration                      | **Goals Page** - View and manage all goals                     |
| ![Journals](./public/screenshots/myjournals.png)                            | ![Global Search](./public/screenshots/GlobalSearch.png)        |
| **My Journals** - Browse all journal entries                                | **Global Search** - Search across your journals                |

### Journal Features

|                                                             |                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| ![New Journal](./public/screenshots/newJournal.png)         | ![Chat Page](./public/screenshots/chatPage.png)           |
| **Create New Journal** - Write a new entry                  | **Chat Page** - AI-powered chatbot                        |
| ![Journal Details](./public/screenshots/journalDetails.png) | ![Quick Write](./public/screenshots/quickWritePopup.png)  |
| **Journal Details** - View full entry with media            | **Quick Write Popup** - Fast journal entry                |
| ![Semantic Search](./public/screenshots/semanticSearch.png) | ![Reflections](./public/screenshots/reflectionsPopup.png) |
| **Semantic Search** - AI-powered search results             | **Reflections Popup** - View goal reflections             |

### Goal Management

|                                                                |                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| ![Add Goal Manual](./public/screenshots/AddGoalManual.png)     | ![Add New Goal](./public/screenshots/AddnewGoal.png)       |
| **Add Goal (Manual)** - Create goal manually                   | **Add New Goal** - Goal creation interface                 |
| ![Add Goal AI](./public/screenshots/AddGoalAI.png)             | ![AI Result](./public/screenshots/AddGoalAIResult.png)     |
| **AI Goal Assistant** - AI-powered goal suggestions            | **AI Goal Results** - Generated goal templates             |
| ![Goal Completed](./public/screenshots/goalCompletedPopup.png) | ![Log Progress](./public/screenshots/logProgressPopup.png) |
| **Goal Completed** - Celebration popup                         | **Log Progress** - Track goal progress                     |

### AI Features

|                                                     |                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| ![ChatBot](./public/screenshots/ChatBot.png)        | ![Keyboard Shortcuts](./public/screenshots/keyboardShortcutPopup.png) |
| **ChatBot Interface** - AI assistant for journaling | **Keyboard Shortcuts** - Quick reference guide                        |

### Settings & Customization

|                                                                      |                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| ![Color Settings](./public/screenshots/colorsSettings.png)           | ![Appearance Settings](./public/screenshots/appearanceSettings.png) |
| **Color Settings** - Customize color scheme                          | **Appearance Settings** - UI preferences                            |
| ![Security Settings](./public/screenshots/securitySettings.png)      | ![Model Settings](./public/screenshots/modelSettings.png)           |
| **Security Settings** - Account security options                     | **Model Settings** - AI model configuration                         |
| ![Data Export Settings](./public/screenshots/dataExportSettings.png) | ![Data Export Page](./public/screenshots/ExportDataPage.png)        |
| **Data Export Settings** - Configure data export                     | **Export Data Page** - Export your journals                         |

---

## Roadmap (Future Enhancements)

- **Advanced RAG Pipeline (with LangChain.js):**
  - Implement a conversational chatbot with memory.
  - Use selective retrieval from a vector database to provide answers based on **journals, goals, progress logs, and audio transcriptions**.
- **Performance Enhancements:**
  - Introduce a **caching layer** for frequently accessed functions using SQLite in-memory mode.
- **Gamification & Analytics:**
  - Full journaling and challenge **streaks system**.
  - Deeper journaling analytics & lifestyle recommendations.
  - Gamification (badges, XP).
- **Core Features:**
  - Full semantic journal search.
  - Customizable daily challenge categories.
  - Export journals to PDF/Markdown.
  - Optional journal sharing with trusted peers.
  - Notifications & Reminders system.
  - Appearance settings (Dark Mode, fonts).
  - Data export options.

---

## Technical Notes

- **Event-Driven Architecture:**
  - Electron desktop app uses EventBus for background AI tasks (title, tags, moodscore, summaries, audio transcription).
- **Audio Pipelines:**
  - **Live Transcription:** Microphone → Whisper.cpp → journal content textarea (real time).
  - **Recorded Audio Transcription:**
    - Save audio (WebM) → Convert to WAV (FFmpeg) → Whisper.cpp transcription → Journal Service updates entry.
- **Local-first AI:**
  - Whisper.cpp for offline transcription.
  - Ollama lightweight models for autocomplete & summaries.
