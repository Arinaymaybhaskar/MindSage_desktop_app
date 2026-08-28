import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Pencil,
  Trash2,
  Calendar,
  AudioLines,
  Tags,
  ArrowLeft,
  FileText,
  ChevronDown,
  Download,
  AlertCircle,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import journalService, { type JournalEntry } from "../api/journalService";
import { useAuth } from "../hooks/useAuth";
import { formatTimeAgo } from "../utils/DateFormatter";
import { motion, AnimatePresence } from "framer-motion";
import DeleteConfirmationModal from "../components/goals/modals/DeleteConfirmationModal";
import ImageLightbox from "../components/chat/ImageLightbox";
import { format } from "date-fns";
import { useToast } from "../hooks/useToast";
import { errorMessage } from "../utils/errors";
import MoodOrb from "../components/ui/MoodOrb";

// --- Helper: Export Journal to Markdown ---
function exportJournalToMarkdown(entry: JournalEntry) {
  console.log("Exporting journal entry:", entry);
  if (!entry) return;

  const createdAt = entry.created_at
    ? format(new Date(entry.created_at), "PPPpp")
    : "Unknown date";

  const tags = JSON.stringify(entry.mood_tags || []);

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
  } catch (e) {
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
    "offline" | "online";
  const { showToast } = useToast();

  // AI Metadata Status
  const [aiMetadataStatus, setAiMetadataStatus] = useState<
    "not_started" | "pending" | "completed" | "failed"
  >(() => {
    // Infer status from entry data if status column is not set
    if (!entry) return "not_started";
    if (entry.ai_metadata_status) return entry.ai_metadata_status;
    // If entry has AI-populated fields but no status, infer completed
    const tags = entry.mood_tags ?? [];
    if (
      entry.title?.trim() &&
      entry.mood_score !== undefined &&
      tags.length > 0
    ) {
      return "completed";
    }
    return "not_started";
  });
  const [aiSummaryStatus, setAiSummaryStatus] = useState<
    "not_started" | "pending" | "completed" | "failed" | "skipped"
  >(() => {
    if (!entry) return "not_started";
    if (entry.ai_summary_status) return entry.ai_summary_status;
    // If entry has summary but no status, infer completed
    if (entry.content_summary) {
      return "completed";
    }
    return "not_started";
  });
  const [aiMetadataError, setAiMetadataError] = useState<string>(
    entry?.ai_metadata_error || "",
  );
  const [aiSummaryError, setAiSummaryError] = useState<string>(
    entry?.ai_summary_error || "",
  );
  const [isRetryingMetadata, setIsRetryingMetadata] = useState(false);
  const [isRetryingSummary, setIsRetryingSummary] = useState(false);

  // Extracted so AI-status events can refresh the entry in place (silent mode
  // skips the loading/error screen so a background refresh doesn't flicker).
  const fetchEntry = useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setLoading(true);
      setError(false);

      try {
        const res = await journalService.getOne(authMode, accessToken!, +id);
        if (!res) {
          if (!silent) setError(true);
        } else {
          setEntry(res);
          if (res.image_key) {
            const url = await window.electron.ipcRenderer.invoke<string>(
              "media:getImage",
              res.image_key.toString(),
            );
            setImageUrl(url);
          }
          if (res.audio_key) {
            const url = await window.electron.ipcRenderer.invoke<string | null>(
              "media:getAudio",
              res.audio_key.toString(),
            );
            setAudioUrl(url);
          }
        }
      } catch (err) {
        console.error("Failed to fetch journal entry:", err);
        if (!silent) setError(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id, authMode, accessToken],
  );

  // Sync AI status from entry when it loads/changes
  useEffect(() => {
    if (entry) {
      // Only override if status is explicitly set in DB, otherwise keep inferred
      if (entry.ai_metadata_status)
        setAiMetadataStatus(entry.ai_metadata_status);
      if (entry.ai_summary_status) setAiSummaryStatus(entry.ai_summary_status);
      setAiMetadataError(entry.ai_metadata_error || "");
      setAiSummaryError(entry.ai_summary_error || "");
    }
  }, [entry]);

  // Listen for AI status events from main process
  useEffect(() => {
    // The main process sends a single { event, data } payload, and the preload
    // `on` bridge forwards it as one argument, so destructure it here rather
    // than expecting two positional args (which left `data` undefined and made
    // this handler silently throw, so status/refresh never updated live).
    const handleAIStatusEvent = (payload: {
      event: string;
      data?: { entryId?: number; [key: string]: unknown };
    }) => {
      const { event, data } = payload ?? {};
      if (!data || data.entryId !== entry?.id) return;

      switch (event) {
        case "journal:aiStarted":
          setAiMetadataStatus("pending");
          setAiMetadataError("");
          break;
        case "journal:aiCompleted":
          setAiMetadataStatus("completed");
          setAiMetadataError("");
          // Pull the freshly generated title / mood / tags into the view.
          fetchEntry(true);
          break;
        case "journal:aiFailed":
          setAiMetadataStatus("failed");
          setAiMetadataError(String(data.error ?? "Unknown error"));
          showToast("AI metadata generation failed", "danger");
          break;
        case "ollama:summary-started":
          setAiSummaryStatus("pending");
          setAiSummaryError("");
          break;
        case "ollama:summary-generated":
          setAiSummaryStatus("completed");
          setAiSummaryError("");
          // Pull the freshly generated summary into the view.
          fetchEntry(true);
          break;
        case "ollama:summary-failed":
          setAiSummaryStatus("failed");
          setAiSummaryError(String(data.error ?? "Unknown error"));
          showToast("AI summary generation failed", "danger");
          break;
        case "ollama:summary-skipped":
          setAiSummaryStatus("skipped");
          break;
      }
    };

    const unsubscribe = window.electron.ipcRenderer.on(
      "ai-status-event",
      handleAIStatusEvent,
    );
    return unsubscribe;
  }, [entry?.id, showToast, fetchEntry]);

  const handleRetryMetadata = async () => {
    if (!entry?.id) return;
    setIsRetryingMetadata(true);
    try {
      const result = await journalService.retryAIMetadata(
        accessToken!,
        entry.id,
        "metadata",
      );
      if (result.success) {
        // The retry handler completes generation before returning, so this
        // fires on completion, not merely on start.
        showToast("AI metadata generated successfully", "success");
      } else {
        showToast(`Retry failed: ${result.error}`, "danger");
      }
    } catch (err) {
      showToast(`Retry failed: ${errorMessage(err)}`, "danger");
    } finally {
      setIsRetryingMetadata(false);
    }
  };

  const handleCancelMetadata = async () => {
    if (!entry?.id) return;
    // Update DB status back to not_started so user can retry.
    // Route through the status-only handler: journal:update would rewrite the
    // whole entry from the partial payload and wipe title/content/tags.
    try {
      await window.electron.ipcRenderer.invoke(
        "journal:update-ai-status",
        accessToken!,
        entry.id,
        {
          ai_metadata_status: "not_started",
          ai_metadata_error: "Cancelled by user",
        },
      );
      setAiMetadataStatus("not_started");
      setAiMetadataError("Cancelled by user");
      showToast("AI metadata generation cancelled", "info");
    } catch (err) {
      showToast(`Cancel failed: ${errorMessage(err)}`, "danger");
    }
  };

  const handleRetrySummary = async () => {
    if (!entry?.id) return;
    setIsRetryingSummary(true);
    try {
      const result = await journalService.retryAIMetadata(
        accessToken!,
        entry.id,
        "summary",
      );
      if (result.success) {
        if (result.skipped) {
          showToast("Entry too short to summarize", "info");
        } else {
          showToast("AI summary generated successfully", "success");
        }
      } else {
        showToast(`Retry failed: ${result.error}`, "danger");
      }
    } catch (err) {
      showToast(`Retry failed: ${errorMessage(err)}`, "danger");
    } finally {
      setIsRetryingSummary(false);
    }
  };

  const handleCancelSummary = async () => {
    if (!entry?.id) return;
    try {
      await window.electron.ipcRenderer.invoke(
        "journal:update-ai-status",
        accessToken!,
        entry.id,
        {
          ai_summary_status: "not_started",
          ai_summary_error: "Cancelled by user",
        },
      );
      setAiSummaryStatus("not_started");
      setAiSummaryError("Cancelled by user");
      showToast("AI summary generation cancelled", "info");
    } catch (err) {
      showToast(`Cancel failed: ${errorMessage(err)}`, "danger");
    }
  };

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
          "success",
        );
      }
    },
    [id, navigate, entry, showToast],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

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
        <span className="font-display text-2xl font-semibold mb-4">
          Journal not found
        </span>
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
      <div className="bg-base-light dark:bg-base-dark h-full overflow-y-auto">
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
                <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-text-light dark:text-text-dark mb-4">
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
                {/* Mood Orb - Prominent at top */}
                <div
                  data-testid="mood-orb"
                  className="flex flex-col items-center gap-4 text-center pt-2"
                >
                  <MoodOrb level={entry.mood_score || 3} size="lg" />
                  <div className="flex items-center justify-center gap-3 text-sm">
                    <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                      Mood Score:
                    </span>
                    <span className="font-bold text-text-light dark:text-text-dark">
                      {entry.mood_score} / 5
                    </span>
                  </div>
                </div>

                {/* AI Insights */}
                {(entry.content_summary || entry.transcription) && (
                  <div className="border-t border-border-light dark:border-border-dark pt-6">
                    <h3 className="font-display text-lg font-bold text-text-light dark:text-text-dark mb-4 flex items-center gap-2">
                      <FileText
                        size={18}
                        className="text-dark1 dark:text-light1"
                      />
                      AI Insights
                    </h3>
                    <div className="space-y-3">
                      {entry.transcription && (
                        <div className="border border-border-light dark:border-border-dark rounded-xl bg-tertiary-light dark:bg-tertiary-dark overflow-hidden">
                          <button
                            data-testid="ai-transcription-accordion"
                            onClick={() =>
                              setIsTranscriptionOpen(!isTranscriptionOpen)
                            }
                            className="w-full flex justify-between items-center p-3 text-left"
                            aria-expanded={isTranscriptionOpen}
                          >
                            <div className="flex items-center gap-3">
                              <FileText
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
                            data-testid="ai-summary-accordion"
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

                {/* Metadata & Tags */}
                <div className="border-t border-border-light dark:border-border-dark pt-6 space-y-5">
                  <div>
                    <div className="flex items-center gap-2 text-sm mb-3">
                      <AudioLines
                        size={16}
                        className="text-dark1 dark:text-light1"
                      />
                      <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                        Sentiment
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-text-light dark:text-text-dark">
                        {entry.sentiment_score?.toFixed(2) || "–"}
                      </span>
                      <div className="w-32 h-2 bg-tertiary-light dark:bg-tertiary-dark rounded-full overflow-hidden">
                        <div
                          className="h-full bg-dark1 dark:bg-light1 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(0, Math.min(100, ((entry.sentiment_score || 0) + 1) * 50))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {moodTags.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-sm mb-3">
                        <Tags
                          size={16}
                          className="text-dark1 dark:text-light1"
                        />
                        <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                          Tags
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {moodTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="bg-tertiary-light dark:bg-tertiary-dark text-dark1 dark:text-light1 px-3 py-1.5 rounded-full text-xs font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                      Created
                    </span>
                    <span className="font-medium text-text-light dark:text-text-dark">
                      {format(new Date(entry.created_at!), "PPP p")}
                    </span>
                  </div>
                </div>

                {/* AI Metadata Status */}
                <div
                  data-testid="ai-metadata-status"
                  data-metadata-status={aiMetadataStatus}
                  data-summary-status={aiSummaryStatus}
                  className="border-t border-border-light dark:border-border-dark pt-6"
                >
                  <h3 className="font-display text-lg font-bold text-text-light dark:text-text-dark mb-4 flex items-center gap-2">
                    <AlertCircle
                      size={18}
                      className="text-dark1 dark:text-light1"
                    />
                    AI Metadata
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                          Auto-populate (Title, Mood, Tags)
                        </span>
                        <span className="font-semibold text-text-light dark:text-text-dark flex items-center gap-1">
                          {aiMetadataStatus === "pending" && (
                            <Loader2
                              size={14}
                              className="animate-spin inline mr-1"
                            />
                          )}
                          {aiMetadataStatus === "completed" && (
                            <CheckCircle2
                              size={14}
                              className="text-green-500 inline mr-1"
                            />
                          )}
                          {aiMetadataStatus === "failed" && (
                            <AlertCircle
                              size={14}
                              className="text-red-500 inline mr-1"
                            />
                          )}
                          {aiMetadataStatus.charAt(0).toUpperCase() +
                            aiMetadataStatus.slice(1).replace("_", " ")}
                        </span>
                      </div>
                      {aiMetadataStatus === "failed" && aiMetadataError && (
                        <p className="text-xs text-red-500 mb-2">
                          {aiMetadataError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {(aiMetadataStatus === "failed" ||
                          aiMetadataStatus === "not_started" ||
                          aiMetadataStatus === "completed") && (
                          <button
                            onClick={handleRetryMetadata}
                            disabled={isRetryingMetadata}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isRetryingMetadata ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                {aiMetadataStatus === "completed"
                                  ? "Regenerating..."
                                  : "Retrying..."}
                              </>
                            ) : (
                              <>
                                <RefreshCw size={14} />
                                {aiMetadataStatus === "completed"
                                  ? "Regenerate"
                                  : "Retry"}
                              </>
                            )}
                          </button>
                        )}
                        {aiMetadataStatus === "pending" && (
                          <button
                            onClick={handleCancelMetadata}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-danger bg-danger/10 rounded-lg hover:bg-danger/20 transition-colors"
                          >
                            <XCircle size={14} />
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-border-light dark:border-border-dark pt-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                          AI Summary
                        </span>
                        <span className="font-semibold text-text-light dark:text-text-dark flex items-center gap-1">
                          {aiSummaryStatus === "pending" && (
                            <Loader2
                              size={14}
                              className="animate-spin inline mr-1"
                            />
                          )}
                          {aiSummaryStatus === "completed" && (
                            <CheckCircle2
                              size={14}
                              className="text-green-500 inline mr-1"
                            />
                          )}
                          {aiSummaryStatus === "failed" && (
                            <AlertCircle
                              size={14}
                              className="text-red-500 inline mr-1"
                            />
                          )}
                          {aiSummaryStatus.charAt(0).toUpperCase() +
                            aiSummaryStatus.slice(1).replace("_", " ")}
                        </span>
                      </div>
                      {aiSummaryStatus === "failed" && aiSummaryError && (
                        <p className="text-xs text-red-500 mb-2">
                          {aiSummaryError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {(aiSummaryStatus === "failed" ||
                          aiSummaryStatus === "not_started" ||
                          aiSummaryStatus === "skipped" ||
                          aiSummaryStatus === "completed") && (
                          <button
                            onClick={handleRetrySummary}
                            disabled={isRetryingSummary}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isRetryingSummary ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                {aiSummaryStatus === "completed"
                                  ? "Regenerating..."
                                  : "Retrying..."}
                              </>
                            ) : (
                              <>
                                <RefreshCw size={14} />
                                {aiSummaryStatus === "completed"
                                  ? "Regenerate"
                                  : "Retry"}
                              </>
                            )}
                          </button>
                        )}
                        {aiSummaryStatus === "pending" && (
                          <button
                            onClick={handleCancelSummary}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-text-light dark:text-text-dark bg-danger/10 dark:bg-danger/20 rounded-lg hover:bg-danger/20 dark:hover:bg-danger/30 transition-colors text-danger"
                          >
                            <XCircle size={14} />
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions - Bottom */}
                <div className="border-t border-border-light dark:border-border-dark pt-6">
                  <h3 className="font-display text-lg font-bold text-text-light dark:text-text-dark mb-4 flex items-center gap-2">
                    <FileText
                      size={18}
                      className="text-dark1 dark:text-light1"
                    />
                    Actions
                  </h3>
                  <div className="flex flex-row gap-2">
                    <button
                      onClick={() => navigate(`/journal/edit/${id}`)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (entry) {
                          exportJournalToMarkdown(entry);
                          showToast(
                            "Please select download location. The file will be available at that location.",
                            "success",
                          );
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark rounded-lg hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-danger bg-danger/10 rounded-lg hover:bg-danger/20 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
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
