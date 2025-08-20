import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Pencil,
  Trash2,
  Calendar,
  Smile,
  AudioLines,
  Tags,
  ArrowLeft,
  X,
} from "lucide-react";
import journalService, { type JournalEntry } from "../api/journalService";
import { useAuth } from "../hooks/useAuth";
import { formatTimeAgo } from "../utils/DateFormatter";
import { motion, AnimatePresence } from "framer-motion";
import DeleteConfirmationModal from "../components/goals/modals/DeleteConfirmationModal";

const parseMoodTags = (tags: string | string[] | undefined): string[] => {
  if (Array.isArray(tags)) return tags;
  if (typeof tags !== "string" || !tags.trim()) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
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
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  // Data fetching logic remains the same...
  useEffect(() => {
    if (!id) return;
    const fetchEntry = async () => {
      try {
        const res = await journalService.getOne(authMode, accessToken!, +id);
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
      } catch (error) {
        console.error("Failed to fetch journal entry:", error);
        setEntry(null); // Handle error case
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

  if (!entry) {
    return (
      <div className="flex items-center justify-center h-screen bg-base-light dark:bg-base-dark text-text-light-sub dark:text-text-dark-sub">
        Loading entry...
      </div>
    );
  }

  const moodTags = parseMoodTags(entry.mood_tags);

  return (
    <>
      <div className="bg-base-light dark:bg-base-dark min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header Navigation */}
          <div className="mb-6">
            <Link
              to="/journals"
              className="flex items-center gap-2 text-text-light-sub dark:text-text-dark-sub hover:text-info dark:hover:text-info font-semibold transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Journals
            </Link>
          </div>

          {/* New Two-Column Layout */}
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
                <div className="mb-8 bg-tertiary-light dark:bg-tertiary-dark p-4 rounded-lg">
                  <audio controls className="w-full">
                    <source src={audioUrl} type="audio/webm" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}

              <div className="prose prose-lg dark:prose-invert text-text-light-sub dark:text-text-dark-sub max-w-none leading-relaxed whitespace-pre-wrap">
                {entry.content}
              </div>
            </article>

            {/* Right Column: Sticky Sidebar for Metadata & Actions */}
            <aside className="w-full lg:w-1/3 lg:sticky top-8 h-fit mt-8 lg:mt-0">
              <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl p-6 border border-border-light dark:border-border-dark space-y-6">
                {/* Actions */}
                <div>
                  <h3 className="text-lg font-bold text-text-light dark:text-text-dark mb-3">
                    Actions
                  </h3>
                  <div className="flex gap-2">
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
                  </div>
                </div>

                {/* Metadata */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Smile size={18} className="text-info" />
                    <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                      Mood Score:
                    </span>
                    <span className="font-bold text-text-light dark:text-text-dark">
                      {entry.mood_score} / 5
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <AudioLines size={18} className="text-info" />
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
                        <Tags size={18} className="text-info" />
                        <span className="font-medium text-text-light-sub dark:text-text-dark-sub">
                          Tags:
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {moodTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="bg-tertiary-light dark:bg-tertiary-dark text-info px-2.5 py-1 rounded-full text-xs font-semibold"
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

      {/* Modals */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        type="journal entry"
      />
      <AnimatePresence>
        {showImageModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-base-dark/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowImageModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute -top-3 -right-3 text-text-dark bg-secondary-dark rounded-full p-1.5 z-10 hover:bg-tertiary-dark transition-colors"
                onClick={() => setShowImageModal(false)}
              >
                <X size={24} />
              </button>
              <img
                src={imageUrl}
                alt="Full View"
                className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
