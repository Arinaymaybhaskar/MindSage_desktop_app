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
  mood_tags: "",
};

// A reusable panel component for the sidebar
const SidebarPanel = ({ title, icon: Icon, children }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex justify-between items-center p-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-indigo-500 dark:text-indigo-400" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">
            {title}
          </h3>
        </div>
        <ChevronDown
          size={20}
          className={`text-gray-500 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
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

  // --- NEW: State for submission loading ---
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- State for Drag-and-Drop ---
  const [isDragging, setIsDragging] = useState(false);

  // Load draft or fetch entry
  useEffect(() => {
    if (isEdit && id) {
      journalService.getOne(authMode, accessToken!, +id).then(setEntry);
    } else {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        setEntry(JSON.parse(savedDraft));
      }
    }
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

    setIsSubmitting(true);

    try {
      let aiRes: any = {};

      // Only call AI if title, mood_score, or mood_tags are missing
      if (
        !entry.title?.trim() ||
        entry.mood_score === undefined ||
        !entry.mood_tags?.length
      ) {
        const prompt = getAutoPopulateValues(entry.content);
        const res2 = await ollamaService.getResponse(
          accessToken!,
          selectedModel!,
          prompt,
          true
        );
        aiRes = JSON.parse(res2);
      }

      // Merge AI data only if missing
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
            : aiRes.mood_tags?.toString(),
      };

      setEntry(mergedEntry);
      console.log("Final entry to save:", mergedEntry);

      // Save to backend
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

      const journalId = isEdit ? id : res.journalId;
      let imageKey, audioKey;

      // Image upload
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

      // Audio upload
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
          resetRecording();
        }
      }

      // Update entry with media keys if needed
      if (imageKey || audioKey) {
        await journalService.update(authMode, accessToken!, journalId, {
          ...mergedEntry,
          image_key: imageKey,
          audio_key: audioKey,
        });
      }

      // Clean up
      localStorage.removeItem(DRAFT_KEY);
      navigate("/dashboard");
    } catch (error) {
      console.error("❌ Submission error", error);
    } finally {
      setIsSubmitting(false);
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
    setImageFile(null);
    setImagePreview(null);
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
    <div className="w-full h-screen overflow-hidden  text-gray-900 dark:text-gray-100">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-xl font-bold font-[fraunces]">
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
                  className="text-sm text-gray-500"
                >
                  Draft saved
                </motion.div>
              )}
            </AnimatePresence>
            {/* --- NEW: Updated Clear button with framer-motion and better styling --- */}
            <motion.button
              type="button"
              onClick={() => setEntry(emptyJournal)}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 font-semibold rounded-lg border border-gray-300 dark:border-gray-700 hover:border-red-500 dark:hover:border-red-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Trash2 size={16} />
              <span>Clear</span>
            </motion.button>
            {/* --- NEW: Updated Create/Save button with loading state --- */}
            <motion.button
              type="submit"
              disabled={isSubmitting || !entry.content.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 w-40 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span className="font-[fraunces]">
                    {isEdit ? "Save Changes" : "Create Entry"}
                  </span>
                </>
              )}
            </motion.button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-grow flex overflow-hidden">
          {/* Left Column: Editor */}
          <div className="flex-grow flex flex-col p-6 overflow-y-auto">
            <input
              id="title"
              type="text"
              placeholder="A Title for Your Thoughts..."
              value={entry.title}
              onChange={(e) => setEntry({ ...entry, title: e.target.value })}
              className="text-3xl font-[fraunces] font-bold bg-transparent focus:outline-none mb-4"
            />
            <textarea
              id="content"
              placeholder="Write freely..."
              value={entry.content}
              onChange={(e) => setEntry({ ...entry, content: e.target.value })}
              className="flex-grow font-inter w-full text-lg bg-transparent focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Right Column: Sidebar */}
          <aside className="w-100 overflow-scroll flex-shrink-0 no-scrollbar border-l border-gray-200 dark:border-gray-800 p-6  space-y-6">
            <SidebarPanel title="Mood & Sentiment" icon={Smile}>
              <MoodSlider
                value={entry.mood_score ?? 50}
                onChange={(score) => setEntry({ ...entry, mood_score: score })}
              />
              <MoodTagSelector
                selected={entry.mood_tags ?? []}
                onChange={(tags) => setEntry({ ...entry, mood_tags: tags })}
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
                      className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                        : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <div className="text-center">
                      <UploadCloud
                        size={32}
                        className={`mx-auto mb-2 transition-transform ${
                          isDragging
                            ? "text-indigo-500 scale-110"
                            : "text-gray-400"
                        }`}
                      />
                      <span className="text-sm font-semibold">
                        {isDragging ? "Drop image to upload" : "Add Image"}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
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
                      className="absolute -top-2 -right-2 p-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-full text-gray-500 hover:text-red-500"
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
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
