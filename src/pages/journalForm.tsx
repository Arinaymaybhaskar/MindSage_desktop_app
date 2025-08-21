import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import journalService, { type JournalEntry } from "../api/journalService";
import {
  ArrowLeft,
  BrainCircuit,
  Paperclip,
  Save,
  Smile,
  ChevronDown,
  X,
  Loader2,
  UploadCloud,
  Mic,
  Trash2,
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
import {
  getAutoPopulateValues,
  getFollowUpQuestionsPrompt,
} from "../utils/prompts/Journal";

const emptyJournal: JournalEntry = {
  title: "",
  content: "",
  mood_score: 0,
  sentiment_score: 0,
  mood_tags: [],
};

// A reusable panel component for the sidebar
const SidebarPanel = ({ title, icon: Icon, children }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex justify-between items-center p-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-info" />
          <h3 className="font-semibold text-text-light dark:text-text-dark">
            {title}
          </h3>
        </div>
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }}>
          <ChevronDown
            size={20}
            className="text-text-light-sub dark:text-text-dark-sub transition-transform"
          />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="p-4 border-t border-border-light dark:border-border-dark">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const voiceRecorderState = useVoiceRecorder();
  const { recordingBlob, resetRecording } = voiceRecorderState;
  const { accessToken } = useAuth();
  const selectedModel = localStorage.getItem("selectedModel");
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Load draft or fetch entry
  useEffect(() => {
    const loadEntry = async () => {
      console.log(
        `[JournalForm] Component mounted. Mode: ${isEdit ? "Edit" : "Create"}`
      );
      if (isEdit && id) {
        console.log(`[JournalForm] Fetching entry with ID: ${id}`);
        const fetchedEntry = await journalService.getOne(
          authMode,
          accessToken!,
          +id
        );
        console.log("[JournalForm] Fetched entry from DB:", fetchedEntry);

        const entryToSet = {
          ...fetchedEntry,
          mood_tags: fetchedEntry.mood_tags || [],
        };
        setEntry(entryToSet);
        console.log("[JournalForm] State set for editing:", entryToSet);

        // If the fetched entry has an image key, get the URL and set it for preview.
        if (fetchedEntry.image_key) {
          console.log(
            `[JournalForm] Entry has an image_key: ${fetchedEntry.image_key}. Fetching image URL.`
          );
          try {
            const url = await window.electron.ipcRenderer.invoke(
              "media:getImage",
              fetchedEntry.image_key.toString()
            );
            setImagePreview(url);
            console.log("[JournalForm] Image preview URL set:", url);
          } catch (error) {
            console.error(
              "[JournalForm] Failed to fetch image for preview:",
              error
            );
          }
        }
      } else {
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (savedDraft) {
          console.log("[JournalForm] Found saved draft in localStorage.");
          const draft = JSON.parse(savedDraft);
          const draftToSet = { ...draft, mood_tags: draft.mood_tags || [] };
          setEntry(draftToSet);
          console.log("[JournalForm] Loaded draft into state:", draftToSet);
        } else {
          console.log(
            "[JournalForm] No draft found. Starting with an empty entry."
          );
        }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry.content || isSubmitting) return;

    console.log("--- [handleSubmit] Starting Submission ---");
    console.log("Initial entry state:", entry);
    setIsSubmitting(true);

    try {
      let aiRes: any = {};

      const needsAiCompletion =
        !entry.title?.trim() ||
        entry.mood_score === undefined ||
        !entry.mood_tags?.length;

      if (needsAiCompletion) {
        console.log("[handleSubmit] Entry needs AI completion. Calling AI...");
        const prompt = getAutoPopulateValues(entry.content);
        const res2 = await ollamaService.getResponse(
          accessToken!,
          selectedModel!,
          prompt,
          true
        );
        aiRes = JSON.parse(res2);
        console.log("[handleSubmit] AI Response received:", aiRes);
      } else {
        console.log("[handleSubmit] Skipping AI call, all fields are present.");
      }

      const mergedEntry: JournalEntry = {
        ...entry,
        title: entry.title?.trim() ? entry.title : aiRes.title,
        mood_score:
          entry.mood_score !== undefined && entry.mood_score !== 0
            ? entry.mood_score
            : aiRes.mood_score,
        mood_tags:
          entry.mood_tags && entry.mood_tags.length > 0
            ? entry.mood_tags
            : aiRes.mood_tags || [],
      };

      console.log("[handleSubmit] Merged entry (User + AI):", mergedEntry);
      setEntry(mergedEntry);

      let res;
      if (isEdit && id) {
        console.log(`[handleSubmit] Updating entry with ID: ${id}`);
        res = await journalService.update(
          authMode,
          accessToken!,
          +Number(id),
          mergedEntry
        );
        console.log("[handleSubmit] Update response:", res);
      } else {
        console.log("[handleSubmit] Creating new entry.");
        res = await journalService.create(authMode, accessToken!, mergedEntry);
        console.log("[handleSubmit] Create response:", res);
      }

      const journalId = isEdit ? +id! : res.journalId;
      console.log(`[handleSubmit] Journal ID for media upload: ${journalId}`);
      let imageKey = entry.image_key; // Start with existing key
      let audioKey;

      if (imageFile) {
        console.log("[handleSubmit] Uploading new image...");
        const arrayBuffer = await imageFile.arrayBuffer();
        const result = await mediaService.saveFileForJournal(
          journalId,
          "image",
          arrayBuffer,
          imageFile.name
        );
        console.log("[handleSubmit] Image upload result:", result);
        if (result.success) imageKey = result.key;
      }

      if (recordingBlob) {
        console.log("[handleSubmit] Uploading audio...");
        const arrayBuffer = await recordingBlob.arrayBuffer();
        const result = await mediaService.saveFileForJournal(
          journalId,
          "audio",
          arrayBuffer,
          `audio-${Date.now()}.webm`
        );
        console.log("[handleSubmit] Audio upload result:", result);
        if (result.success) {
          audioKey = result.key;
          resetRecording();
        }
      }

      // Only update with media keys if there's a new key or a key was changed.
      if (imageKey !== entry.image_key || audioKey) {
        console.log("[handleSubmit] Updating entry with media keys:", {
          imageKey,
          audioKey,
        });
        await journalService.update(authMode, accessToken!, journalId, {
          ...mergedEntry,
          image_key: imageKey,
          audio_key: audioKey,
        });
      }

      console.log("[handleSubmit] Cleaning up and navigating...");
      localStorage.removeItem(DRAFT_KEY);
      navigate("/dashboard");
    } catch (error) {
      console.error("❌ [handleSubmit] Submission error:", error);
    } finally {
      setIsSubmitting(false);
      console.log("--- [handleSubmit] Submission Finished ---");
    }
  };

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
    console.log("[JournalForm] Removing image.");
    setImageFile(null); // Clear any newly selected file
    setImagePreview(null); // Clear the preview
    setEntry((prev) => ({ ...prev, image_key: null })); // Clear the key from the entry state
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
            <h1 className="text-xl font-bold ">
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
              onClick={() => setEntry(emptyJournal)}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-danger bg-danger/10 rounded-lg hover:bg-danger/20 transition-all disabled:opacity-50"
            >
              <Trash2 size={16} />
              <span>Clear</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !entry.content.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 w-40 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
          <div className="flex-grow flex flex-col p-6 overflow-y-auto">
            <input
              id="title"
              type="text"
              placeholder="A Title for Your Thoughts..."
              value={entry.title}
              onChange={(e) => setEntry({ ...entry, title: e.target.value })}
              className="text-3xl font-[fraunces] font-bold bg-transparent focus:outline-none mb-4 placeholder:text-text-light-sub/50 dark:placeholder:text-text-dark-sub/50"
            />
            <textarea
              id="content"
              placeholder="Write freely..."
              value={entry.content}
              onChange={(e) => setEntry({ ...entry, content: e.target.value })}
              className="flex-grow font-inter w-full text-lg bg-transparent focus:outline-none resize-none leading-relaxed placeholder:text-text-light-sub/50 dark:placeholder:text-text-dark-sub/50"
            />
          </div>

          {/* Sidebar Column */}
          <aside className="w-96 overflow-y-auto flex-shrink-0 no-scrollbar border-l border-border-light dark:border-border-dark p-6 space-y-6">
            <SidebarPanel title="Mood & Sentiment" icon={Smile}>
              <MoodSlider
                value={entry.mood_score ?? 50}
                onChange={(score) => setEntry({ ...entry, mood_score: score })}
              />
              <MoodTagSelector
                key={JSON.stringify(entry.mood_tags)} // FIX: Force re-mount when tags change from parent
                selected={entry.mood_tags ?? []}
                onChange={(tags) => {
                  console.log(
                    "[MoodTagSelector] onChange triggered. New tags:",
                    tags
                  );
                  setEntry({ ...entry, mood_tags: tags });
                }}
              />
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
                        ? "border-info bg-info/10"
                        : "border-border-light dark:border-border-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
                    }`}
                  >
                    <div className="text-center">
                      <UploadCloud
                        size={32}
                        className={`mx-auto mb-2 transition-transform ${
                          isDragging
                            ? "text-info scale-110"
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
                <VoiceRecorderUI {...voiceRecorderState} />
                {recordingBlob && (
                  <div className="relative w-full">
                    <audio
                      controls
                      src={URL.createObjectURL(recordingBlob)}
                      className="w-full"
                    />
                    <button
                      type="button"
                      onClick={resetRecording}
                      className="absolute -top-2 -right-2 p-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-full text-text-light-sub hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </SidebarPanel>

            <SidebarPanel title="AI Tools" icon={BrainCircuit}>
              <button
                type="button"
                onClick={handleGenerateQuestions}
                disabled={isGeneratingQuestions || !entry.content.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-tertiary-light dark:bg-tertiary-dark text-info font-semibold rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 disabled:opacity-50 transition-colors"
              >
                {isGeneratingQuestions ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Mic size={18} />
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
