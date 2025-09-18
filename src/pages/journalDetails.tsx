import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Pencil,
  Trash2,
  Calendar,
  Smile,
  AudioLines,
  Tags,
  ArrowLeft,
  FileText,
  ChevronDown,
  Captions,
  Download,
} from "lucide-react";
import journalService, { type JournalEntry } from "../api/journalService";
import { useAuth } from "../hooks/useAuth";
import { formatTimeAgo } from "../utils/DateFormatter";
import { motion, AnimatePresence } from "framer-motion";
import DeleteConfirmationModal from "../components/goals/modals/DeleteConfirmationModal";
import ImageLightbox from "../components/chat/ImageLightbox";
import { format } from "date-fns";
import { useToast } from "../context/ToastContext";

// --- Helper: Export Journal to Markdown ---
function exportJournalToMarkdown(entry: JournalEntry) {
  console.log("Exporting journal entry:", entry);
  if (!entry) return;

  const createdAt = entry.created_at
    ? format(new Date(entry.created_at), "PPPpp")
    : "Unknown date";

  const tags =
    entry.mood_tags && typeof entry.mood_tags === "string"
      ? entry.mood_tags
      : JSON.stringify(entry.mood_tags || []);

  const markdown = `# ${entry.title || "Untitled"}  

**Date:** ${createdAt}  
**Mood Score:** ${entry.mood_score || "-"} / 5  
**Sentiment:** ${entry.sentiment_score?.toFixed(2) || "-"}  
**Tags:** ${tags}  

---

${entry.content || ""}

---
${entry.transcription ? `## Transcription\n\n${entry.transcription}\n\n` : ""}${
    entry.content_summary ? `## Summary\n\n${entry.content_summary}\n\n` : ""
  }
`;

  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${entry.title || "journal"}-${Date.now()}.md`;
  a.click();

  window.URL.revokeObjectURL(url);
}

const parseMoodTags = (tags: string | string[] | undefined): string[] => {
  if (Array.isArray(tags)) return tags;
  if (typeof tags !== "string" || !tags.trim()) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e: any) {
    console.error("Failed to parse mood tags:", e);
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
};

export default function JournalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true); // New loading state
  const [error, setError] = useState(false); // New error state
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isTranscriptionOpen, setIsTranscriptionOpen] = useState(false);
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";
  const { showToast } = useToast();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "e" && !e.shiftKey) {
        e.preventDefault();
        if (id) navigate(`/journal/edit/${id}`);
      }
      if (e.key === "Delete") {
        e.preventDefault();
        setIsDeleteModalOpen(true);
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        exportJournalToMarkdown(entry!);
        showToast(
          "Please select download location. The file will be available at that location.",
          "success"
        );
      }
    },
    [id, navigate, entry]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!id) return;

    const fetchEntry = async () => {
      setLoading(true);
      setError(false);

      try {
        const res = await journalService.getOne(authMode, accessToken!, +id);
        if (!res) {
          setError(true);
        } else {
          setEntry(res);
          if (res.image_key) {
            const url = await window.electron.ipcRenderer.invoke(
              "media:getImage",
              res.image_key.toString()
            );
            setImageUrl(url);
          }
          if (res.audio_key) {
            const url = await window.electron.ipcRenderer.invoke(
              "media:getAudio",
              res.audio_key.toString()
            );
            setAudioUrl(url);
          }
        }
      } catch (err) {
        console.error("Failed to fetch journal entry:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchEntry();
  }, [id, authMode, accessToken]);

  const handleDeleteConfirm = async () => {
    if (!id) return;
    await journalService.remove(authMode, accessToken!, +id);
    setIsDeleteModalOpen(false);
    navigate("/journals");
  };

  // --- Render loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-base-light dark:bg-base-dark text-text-light-sub dark:text-text-dark-sub">
        <span className="animate-pulse text-lg font-medium">
          Loading your journal...
        </span>
      </div>
    );
  }

  // --- Render error / not found state ---
  if (error || !entry) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-base-light dark:bg-base-dark text-text-light-sub dark:text-text-dark-sub">
        <span className="text-2xl font-semibold mb-4">Journal not found</span>
        <button
          onClick={() => navigate("/journals")}
          className="px-4 py-2 bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors"
        >
          Back to Journals
        </button>
      </div>
    );
  }

  // --- Parse mood tags ---
  const moodTags = parseMoodTags(entry.mood_tags);

  // --- Render the main entry view ---
  return (
    <>
      <div className="bg-base-light dark:bg-base-dark min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header Navigation */}
          <div className="mb-6">
            <Link
              to="/journals"
              className="flex items-center gap-2 text-text-light-sub dark:text-text-dark-sub hover:text-dark1 dark:text-light1 dark:hover:text-dark1 font-semibold transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Journals
            </Link>
          </div>

          <div className="flex flex-col lg:flex-row lg:gap-8">
            {/* Left Column: Main Content */}
            <article className="w-full lg:w-2/3 bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl p-6 sm:p-10 border border-border-light dark:border-border-dark">
              <header className="mb-8 border-b border-border-light dark:border-border-dark pb-8">
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-text-light dark:text-text-dark mb-4">
                  {entry.title}
                </h1>
                <div className="text-sm text-text-light-sub dark:text-text-dark-sub flex items-center gap-2">
                  <Calendar size={16} />
                  <span>{formatTimeAgo(entry.created_at!)}</span>
                </div>
              </header>

              {imageUrl && (
                <div className="mb-8">
                  <img
                    src={imageUrl}
                    alt="Journal visual"
                    className="w-full max-h-96 object-cover rounded-xl cursor-pointer shadow-md"
                    onClick={() => setShowImageModal(true)}
                  />
                </div>
              )}

              {audioUrl && (
                <div className="mb-8 p-4">
                  <audio
                    controls
                    className="w-full bg-transparent audio-player"
                  >
                    <source src={audioUrl} type="audio/webm" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}

              <div className="prose prose-lg dark:prose-invert text-text-light-sub dark:text-text-dark-sub max-w-none leading-relaxed whitespace-pre-wrap">
                {entry.content}
              </div>
            </article>

            {/* Right Column: Sticky Sidebar */}
            <aside className="w-full lg:w-1/3 lg:sticky top-8 h-fit mt-8 lg:mt-0">
              <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl p-6 border border-border-light dark:border-border-dark space-y-6">
                {/* Actions */}
                <div>
                  <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-3">
                    Actions
                  </h3>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => navigate(`/journal/edit/${id}`)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors"
                    >
                      <Pencil size={14} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-danger bg-danger/10 rounded-lg hover:bg-danger/20 transition-colors"
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                    <button
                      onClick={() => {
                        if (entry) {
                          exportJournalToMarkdown(entry);
                          showToast(
                            "Please select download location. The file will be available at that location.",
                            "success"
                          );
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors"
                    >
                      <Download size={14} />
                      <span>Export</span>
                    </button>
                  </div>
                </div>

                {/* AI Insights */}
                {(entry.content_summary || entry.transcription) && (
                  <div>
                    <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-3">
                      AI Insights
                    </h3>
                    <div className="space-y-2">
                      {entry.transcription && (
                        <div className="border border-border-light dark:border-border-dark rounded-xl bg-tertiary-light dark:bg-tertiary-dark overflow-hidden">
                          <button
                            onClick={() =>
                              setIsTranscriptionOpen(!isTranscriptionOpen)
                            }
                            className="w-full flex justify-between items-center p-3 text-left"
                            aria-expanded={isTranscriptionOpen}
                          >
                            <div className="flex items-center gap-3">
                              <Captions
                                size={16}
                                className="text-dark1 dark:text-light1"
                              />
                              <h4 className="font-semibold text-sm text-text-light dark:text-text-dark">
                                Transcription
                              </h4>
                            </div>
                            <motion.div
                              animate={{
                                rotate: isTranscriptionOpen ? 180 : 0,
                              }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronDown
                                size={18}
                                className="text-text-light-sub dark:text-text-dark-sub"
                              />
                            </motion.div>
                          </button>
                          <AnimatePresence>
                            {isTranscriptionOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  duration: 0.3,
                                  ease: "easeInOut",
                                }}
                                className="overflow-hidden"
                              >
                                <div className="text-sm text-text-light-sub dark:text-text-dark-sub max-w-none px-3 pb-3 pt-0 whitespace-pre-wrap">
                                  {entry.transcription}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {entry.content_summary && (
                        <div className="border border-border-light dark:border-border-dark rounded-xl bg-tertiary-light dark:bg-tertiary-dark overflow-hidden">
                          <button
                            onClick={() => setIsSummaryOpen(!isSummaryOpen)}
                            className="w-full flex justify-between items-center p-3 text-left"
                            aria-expanded={isSummaryOpen}
                          >
                            <div className="flex items-center gap-3">
                              <FileText
                                size={16}
                                className="text-dark1 dark:text-light1"
                              />
                              <h4 className="font-semibold text-sm text-text-light dark:text-text-dark">
                                Summary
                              </h4>
                            </div>
                            <motion.div
                              animate={{ rotate: isSummaryOpen ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronDown
                                size={18}
                                className="text-text-light-sub dark:text-text-dark-sub"
                              />
                            </motion.div>
                          </button>
                          <AnimatePresence>
                            {isSummaryOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  duration: 0.3,
                                  ease: "easeInOut",
                                }}
                                className="overflow-hidden"
                              >
                                <div className="text-sm text-text-light-sub dark:text-text-dark-sub max-w-none px-3 pb-3 pt-0 whitespace-pre-wrap">
                                  {entry.content_summary}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Smile size={18} className="text-dark1 dark:text-light1" />
                    <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                      Mood Score:
                    </span>
                    <span className="font-bold text-text-light dark:text-text-dark">
                      {entry.mood_score} / 5
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <AudioLines
                      size={18}
                      className="text-dark1 dark:text-light1"
                    />
                    <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                      Sentiment:
                    </span>
                    <span className="font-bold text-text-light dark:text-text-dark">
                      {entry.sentiment_score?.toFixed(2)}
                    </span>
                  </div>
                  {moodTags.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Tags
                          size={18}
                          className="text-dark1 dark:text-light1"
                        />
                        <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                          Tags:
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {moodTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="bg-tertiary-light dark:bg-tertiary-dark text-dark1 dark:text-light1 px-2.5 py-1 rounded-full text-xs font-semibold"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        type="journal entry"
      />
      {showImageModal && (
        <ImageLightbox
          url={imageUrl}
          onClose={() => setShowImageModal(false)}
        />
      )}
    </>
  );
}
