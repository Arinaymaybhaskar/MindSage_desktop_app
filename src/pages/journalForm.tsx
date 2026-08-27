import { useEffect, useState, useRef, KeyboardEvent, ChangeEvent } from "react"; // START: Added useRef, KeyboardEvent, ChangeEvent
import { Link, useNavigate, useParams } from "react-router-dom";
import journalService, { type JournalEntry } from "../api/journalService";
import whisperService from "../api/whisperService";
import {
  ArrowLeft,
  BrainCircuit,
  Paperclip,
  Save,
  Smile,
  X,
  Loader2,
  Mic,
  Trash2,
  MicOff,
  ImagePlus,
  PencilOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MoodTagSelector } from "../components/moodOptions";
import { MoodSlider } from "../components/moodSlider";
import { FollowUpQuestions } from "../components/followUpQuestions";
import { useAuth } from "../hooks/useAuth";
import { mediaService } from "../api/mediaService";
import VoiceRecorderUI from "../components/voiceRecorder";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { ollamaService } from "../api/ollamaService";
import { getFollowUpQuestionsPrompt } from "../utils/prompts/Journal";
import { SidebarPanel } from "../components/journal/SidebarPanel";

const emptyJournal: JournalEntry = {
  title: "",
  content: "",
  mood_score: 0,
  sentiment_score: 0,
  mood_tags: [],
};

export default function JournalForm() {
  const [entry, setEntry] = useState<JournalEntry>(emptyJournal);
  const { id } = useParams();
  const navigate = useNavigate();
  const [showSaved, setShowSaved] = useState(false);
  const isEdit = Boolean(id);
  const DRAFT_KEY = id ? `draft-journal-${id}` : "draft-journal";
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState<string | null>(null); // State for existing audio
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const voiceRecorderState = useVoiceRecorder();
  const { recordingBlob, resetRecording } = voiceRecorderState;
  const { accessToken } = useAuth();
  const [selectedModel, setSelectedModel] = useState<string>("");
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const models = await window.electron.ipcRenderer.invoke(
          "models:get-selected"
        );
        // Use the chat model for journal responses
        if (models?.chat) {
          setSelectedModel(models.chat);
        } else {
          console.error("[JournalForm] No chat model selected");
        }
      } catch (err) {
        console.error("[JournalForm] Failed to load model settings:", err);
      }
    };
    fetchSettings();
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [editedDate, setEditedDate] = useState<string>("");

  // START: Added state for inline autocomplete suggestions
  const [suggestion, setSuggestion] = useState("");
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [showEmptyContentPopup, setShowEmptyContentPopup] = useState(false);

  // Keyboard listener for Ctrl+Enter / Cmd+Enter
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isSubmit =
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter";

      if (!isSubmit) return;

      e.preventDefault();

      if (!entry.content.trim()) {
        setShowEmptyContentPopup(true);
        setTimeout(() => setShowEmptyContentPopup(false), 2500);
        return;
      }

      // Trigger submit programmatically
      handleSubmit(new Event("submit") as unknown as React.FormEvent);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [entry.content, isSubmitting]);

  // Load draft or fetch entry
  useEffect(() => {
    const loadEntry = async () => {
      if (isEdit && id) {
        const fetchedEntry = await journalService.getOne(
          authMode,
          accessToken!,
          +id
        );

        const entryToSet = {
          ...fetchedEntry,
          mood_tags: fetchedEntry.mood_tags || [],
        };
        setEntry(entryToSet);

        // Set the edited date to the entry's created_at date
        if (fetchedEntry.created_at) {
          const dateObj = new Date(fetchedEntry.created_at);
          // Format as datetime-local value (local time in YYYY-MM-DDTHH:mm format)
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          const hours = String(dateObj.getHours()).padStart(2, '0');
          const minutes = String(dateObj.getMinutes()).padStart(2, '0');
          const dateString = `${year}-${month}-${day}T${hours}:${minutes}`;
          setEditedDate(dateString);
        }

        // If the fetched entry has an image key, get the URL and set it for preview.
        if (fetchedEntry.image_key) {
          try {
            const url = await window.electron.ipcRenderer.invoke(
              "media:getImage",
              fetchedEntry.image_key.toString()
            );
            setImagePreview(url);
          } catch (error) {
            console.error(
              "[JournalForm] Failed to fetch image for preview:",
              error
            );
          }
        }

        // If the fetched entry has an audio key, get the URL for playback.
        if (fetchedEntry.audio_key) {
          try {
            const url = await window.electron.ipcRenderer.invoke(
              "media:getAudio",
              fetchedEntry.audio_key.toString()
            );
            setExistingAudioUrl(url);
          } catch (error) {
            console.error(
              "[JournalForm] Failed to fetch audio for preview:",
              error
            );
          }
        }
      } else {
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          const draftToSet = { ...draft, mood_tags: draft.mood_tags || [] };
          setEntry(draftToSet);
        } else {
          setEntry(emptyJournal);
        }
        
        // Initialize editedDate to now for new entries
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}T${hours}:${minutes}`;
        setEditedDate(dateString);
      }
    };

    loadEntry();
  }, [id, isEdit, authMode, accessToken, DRAFT_KEY]);

  // Auto-save draft
  useEffect(() => {
    if (isEdit) return; // Don't auto-save for existing entries
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(entry));
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }, 1500);
    return () => clearTimeout(timer);
  }, [entry, isEdit, DRAFT_KEY]);

  // Save draft immediately when user presses Ctrl/Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = (e.key || "").toLowerCase();
      const isSave = (e.ctrlKey || e.metaKey) && key === "s";
      if (!isSave) return;
      e.preventDefault();
      if (isEdit) return; // don't save drafts for existing entries
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(entry));
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      } catch (err) {
        console.error("[JournalForm] Failed to save draft via shortcut:", err);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [entry, isEdit, DRAFT_KEY]);

  // Live transcription
  useEffect(() => {
    const unsubscribe = whisperService.onLiveData((data) => {
      if (data?.text) {
        setEntry((prev) => ({
          ...prev,
          content:
            (prev.content ? prev.content.trim() + " " : "") + data.text.trim(),
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  // START: Add useEffect for debounced autocomplete suggestions
  useEffect(() => {
    if (!entry.content || entry.content.trim().length < 20) {
      setSuggestion("");
      return;
    }

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(async () => {
      try {
        const prompt = entry.content.trim();

        const result = await window.electron.ipcRenderer.invoke(
          "ollama:generate-suggestion",
          prompt,
          5
        );

        if (result && typeof result === "string") {
          const cleanedSuggestion = result
            .replace(/"/g, "")
            .replace(/\n/g, " ")
            .trim();
          setSuggestion("  " + cleanedSuggestion);
        }
      } catch (error) {
        console.error("Failed to generate suggestion:", error);
        setSuggestion("");
      }
    }, 2000); // High debounce of 2 seconds

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [entry.content]);
  // END: Add useEffect

  const toggleLiveTranscription = async () => {
    if (isTranscribing) {
      await whisperService.stopLive();
      setIsTranscribing(false);
    } else {
      await whisperService.startLive();
      setIsTranscribing(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry.content || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const mergedEntry: JournalEntry = {
        ...entry,
        title: entry.title?.trim() ? entry.title : "",
        mood_score: entry.mood_score ?? 0,
        mood_tags: entry.mood_tags ?? [],
        created_at: editedDate ? new Date(editedDate).toISOString() : entry.created_at,
      };

      setEntry(mergedEntry);

      let res;
      if (isEdit && id) {
        res = await journalService.update(
          authMode,
          accessToken!,
          +Number(id),
          mergedEntry
        );
      } else {
        res = await journalService.create(authMode, accessToken!, mergedEntry);
      }

      const journalId = isEdit ? +id! : res.id;
      let imageKey = entry.image_key;
      let audioKey = entry.audio_key;

      if (imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const result = await mediaService.saveFileForJournal(
          journalId,
          "image",
          arrayBuffer,
          imageFile.name
        );
        if (result.success) imageKey = result.key;
      }

      if (recordingBlob) {
        const arrayBuffer = await recordingBlob.arrayBuffer();
        const result = await mediaService.saveFileForJournal(
          journalId,
          "audio",
          arrayBuffer,
          `audio-${Date.now()}.webm`
        );
        if (result.success) {
          audioKey = result.key;
          
          // Trigger transcription for the saved audio file
          try {
            // The audioKey contains the file path after WAV conversion
            const transcription = await window.electron.ipcRenderer.invoke(
              "whisper:transcribe-journal-audio",
              audioKey,
              journalId
            );
            if (transcription) {
              // Update the entry with the transcription
              const entryWithTranscription = {
                ...mergedEntry,
                transcription: transcription,
              };
              await journalService.update(
                authMode,
                accessToken!,
                journalId,
                entryWithTranscription
              );
            }
          } catch (err) {
            console.error("Failed to transcribe audio:", err);
          }
          resetRecording();
        }
      }

      const needsMediaUpdate =
        imageKey !== res.image_key || audioKey !== res.audio_key;

      if (needsMediaUpdate) {
        await journalService.update(authMode, accessToken!, journalId, {
          ...mergedEntry,
          image_key: imageKey,
          audio_key: audioKey,
        });
      }
      await window.electron.ipcRenderer.invoke(
        "qdrant:sync-journal",
        journalId
      );

      localStorage.removeItem(DRAFT_KEY);
      navigate("/dashboard");
    } catch (error) {
      console.error("❌ [handleSubmit] Submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  const handleGenerateQuestions = async () => {
    setIsGeneratingQuestions(true);
    const prompt = getFollowUpQuestionsPrompt(entry.content);
    try {
      const res = await ollamaService.getResponse(
        accessToken!,
        selectedModel!,
        prompt
      );
      const cleaned = (res as string).replace(/```json|```/g, "").trim();
      setFollowUpQuestions(JSON.parse(cleaned));
    } catch (error) {
      console.error("Error fetching AI question:", error);
      setFollowUpQuestions(["Could not generate questions. Please try again."]);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // START: Add handlers for autocomplete suggestion
  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    // As the user types, clear the current suggestion to prevent it from lingering.
    if (suggestion) {
      setSuggestion("");
    }
    setEntry({ ...entry, content: e.target.value });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const isAtEnd = e.currentTarget.selectionStart === entry.content.length;

    // Accept with Tab key (kept as an option)
    const isTabAccept = e.key === "Tab" && suggestion;

    const isWordAccept =
      (e.ctrlKey || e.metaKey) &&
      e.key === "ArrowRight" &&
      suggestion &&
      isAtEnd;

    if (isTabAccept) {
      e.preventDefault();
      setEntry({ ...entry, content: entry.content + suggestion });
      setSuggestion("");
    } else if (isWordAccept) {
      e.preventDefault();
      const suggestionWords = suggestion.trim().split(" ");
      const firstWord = suggestionWords[0];
      const remainingSuggestion = suggestionWords.slice(1).join(" ");

      setEntry({ ...entry, content: entry.content + " " + firstWord });
      setSuggestion(remainingSuggestion ? " " + remainingSuggestion : "");
    }
  };
  // END: Add handlers

  const processImageFile = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setEntry((prev) => ({ ...prev, image_key: null }));
  };

  const handleRemoveAudio = () => {
    setExistingAudioUrl(null);
    setEntry((prev) => ({ ...prev, audio_key: null }));
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-base-light dark:bg-base-dark text-text-light dark:text-text-dark">
      <AnimatePresence>
        {showEmptyContentPopup && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 right-6 z-30 justify-center items-center bg-warning text-black flex p-5 gap-3  px-4 py-2 rounded-lg shadow-lg"
          >
            <PencilOff size={18} />
            <p>You have to write something before submitting.</p>
          </motion.div>
        )}
      </AnimatePresence>
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border-light dark:border-border-dark">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="p-2 rounded-full hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <h1 className="font-display text-xl font-bold ">
              {isEdit ? "Edit Entry" : "New Journal Entry"}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <AnimatePresence>
              {showSaved && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="text-sm text-text-light-sub dark:text-text-dark-sub"
                >
                  Draft saved
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={toggleLiveTranscription}
              data-testid="mic-toggle"
              data-recording={isTranscribing ? "true" : "false"}
              title={
                isTranscribing ? "Stop Transcription" : "Start Transcription"
              }
              className={` p-2 rounded-full shadow-lg transition-all ${
                isTranscribing
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-light1 dark:bg-dark1 text-white hover:bg-light1 "
              }`}
            >
              {isTranscribing ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button
              type="button"
              onClick={() => setEntry(emptyJournal)}
              disabled={isSubmitting}
              data-testid="journal-clear"
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-danger bg-danger/10 rounded-lg hover:bg-danger/20 transition-all disabled:opacity-50"
            >
              <Trash2 size={16} />
              <span>Clear</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !entry.content.trim()}
              data-testid="journal-save"
              className="flex items-center justify-center gap-2 px-4 py-2 w-44 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 dark:bg-dark1/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span className="">
                    {isEdit ? "Save Changes" : "Create Entry"}
                  </span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-grow flex overflow-hidden">
          {/* Editor Column */}
          <div className="flex-grow flex flex-col m-6 p-6 rounded-xl overflow-y-auto bg-tertiary-light dark:bg-tertiary-dark">
            <input
              id="title"
              type="text"
              data-testid="journal-title-input"
              placeholder="A Title for Your Thoughts..."
              value={entry.title}
              onChange={(e) => setEntry({ ...entry, title: e.target.value })}
              className="text-3xl font-display font-bold bg-transparent focus:outline-none mb-4 placeholder:text-text-light-sub/50 dark:placeholder:text-text-dark-sub/50"
            />

            {/* START: Modified editor area for ghost text autocomplete */}
            <div className="relative flex-grow">
              {/* Ghost text layer - sits behind the textarea.
                  whitespace-pre-wrap matches how a <textarea> intrinsically
                  renders text: a plain <div> collapses blank lines and
                  repeated spaces by default, while a textarea preserves them
                  exactly. Without this, any entry with a paragraph break laid
                  this invisible copy out shorter than the real text, so the
                  visible suggestion span appended after it landed wherever
                  that shorter layout ended - mid-paragraph, overlapping
                  already-typed text - instead of at the real cursor. */}
              <div
                className="absolute inset-0 font-inter text-lg leading-relaxed whitespace-pre-wrap break-words pointer-events-none"
                aria-hidden="true"
              >
                <span className="text-transparent">{entry.content}</span>
                <span
                  data-testid="ai-ghost-suggestion"
                  className="text-text-light-sub/50 dark:text-text-dark-sub/50"
                >
                  {suggestion}
                </span>
              </div>
              <textarea
                id="content"
                ref={contentRef}
                data-testid="journal-body-input"
                placeholder="Write freely, or click the mic to start speaking..."
                value={entry.content}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                className="relative z-10 w-full h-full font-inter text-lg bg-transparent focus:outline-none resize-none leading-relaxed placeholder:text-text-light-sub/50 dark:placeholder:text-text-dark-sub/50"
              />
            </div>
            {/* END: Modified editor area */}
          </div>

          {/* Sidebar Column */}
          <aside className="w-96 overflow-y-auto flex-shrink-0 no-scrollbar border-l border-border-light dark:border-border-dark p-6 space-y-6">
            <SidebarPanel title="Mood & Sentiment" icon={Smile}>
              <MoodSlider
                value={entry.mood_score ?? 50}
                onChange={(score) => setEntry({ ...entry, mood_score: score })}
              />
              <MoodTagSelector
                key={JSON.stringify(entry.mood_tags)}
                selected={entry.mood_tags ?? []}
                onChange={(tags) => {
                  setEntry({ ...entry, mood_tags: tags });
                }}
              />
            </SidebarPanel>

            <SidebarPanel title="Entry Date" icon={Smile}>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-light dark:text-text-dark">
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={editedDate}
                  onChange={(e) => setEditedDate(e.target.value)}
                  className="w-full px-3 py-2 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-light1 dark:focus:ring-dark1"
                />
              </div>
            </SidebarPanel>

            <SidebarPanel title="Attachments" icon={Paperclip}>
              <div className="space-y-4">
                {imagePreview ? (
                  <div className="relative group">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 p-1.5 bg-base-dark/60 text-text-dark rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                      isDragging
                        ? "border-info bg-light1 dark:bg-dark1/10"
                        : "border-border-light dark:border-border-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
                    }`}
                  >
                    <div className="text-center">
                      <ImagePlus
                        size={32}
                        className={`mx-auto mb-2 transition-transform ${
                          isDragging
                            ? "text-dark1 dark:text-light1 scale-110"
                            : "text-text-light-sub dark:text-text-dark-sub"
                        }`}
                      />
                      <span className="text-sm font-semibold">
                        {isDragging ? "Drop image to upload" : "Add Image"}
                      </span>
                      <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                        or click to browse
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                  </label>
                )}

                {/* --- START: UPDATED AUDIO SECTION --- */}
                {isEdit && existingAudioUrl && !recordingBlob && (
                  <div className="relative w-full">
                    <p className="text-sm font-semibold mb-2 text-text-light-sub dark:text-text-dark-sub">
                      Current Audio
                    </p>
                    <audio controls src={existingAudioUrl} className="w-full" />
                    <button
                      type="button"
                      onClick={handleRemoveAudio}
                      className="absolute top-5 right-[-4px] p-1.5 bg-tertiary-light dark:bg-tertiary-dark rounded-full text-text-light-sub hover:text-danger"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {!recordingBlob && <VoiceRecorderUI {...voiceRecorderState} />}

                {recordingBlob && (
                  <div className="relative w-full">
                    <p className="text-sm font-semibold mb-2 text-text-light-sub dark:text-text-dark-sub">
                      New Recording
                    </p>
                    <audio
                      controls
                      src={URL.createObjectURL(recordingBlob)}
                      className="w-full"
                    />
                    <button
                      type="button"
                      onClick={resetRecording}
                      className="absolute top-5 right-[-4px] p-1.5 bg-tertiary-light dark:bg-tertiary-dark rounded-full text-text-light-sub hover:text-danger"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                {/* --- END: UPDATED AUDIO SECTION --- */}
              </div>
            </SidebarPanel>

            <SidebarPanel title="AI Tools" icon={BrainCircuit}>
              <button
                type="button"
                onClick={handleGenerateQuestions}
                disabled={isGeneratingQuestions || !entry.content.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-tertiary-light dark:bg-tertiary-dark text-dark1 dark:text-light1 font-semibold rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 disabled:opacity-50 transition-colors"
              >
                {isGeneratingQuestions ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <BrainCircuit size={18} />
                )}
                <span>
                  {isGeneratingQuestions
                    ? "Generating..."
                    : "Follow-up Questions"}
                </span>
              </button>
              {followUpQuestions.length > 0 && (
                <div className="mt-4">
                  <FollowUpQuestions questions={followUpQuestions} />
                </div>
              )}
            </SidebarPanel>
          </aside>
        </div>
      </form>
    </div>
  );
}
