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
import DeleteConfirmationModal from "../components/goals/modals/DeleteConfirmationModal"; // Assuming path

// Safely parse mood tags, returning an empty array on failure
const parseMoodTags = (tags: string | string[] | undefined): string[] => {
  if (Array.isArray(tags)) return tags;
  if (typeof tags !== "string" || !tags.trim()) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // Fallback for comma-separated strings that are not valid JSON arrays
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
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-slate-900 text-gray-500">
        Loading entry...
      </div>
    );
  }

  const moodTags = parseMoodTags(entry.mood_tags);

  return (
    <>
      <div className="bg-gray-100 dark:bg-slate-900 min-h-screen p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header Navigation */}
          <div className="flex justify-between items-center mb-6">
            <Link
              to="/journals"
              className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Journals
            </Link>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/journal/edit/${id}`)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Pencil size={14} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Main Article */}
          <article className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl p-6 sm:p-10">
            <header className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-8">
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-4">
                {entry.title}
              </h1>
              <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Calendar size={16} />
                <span>{formatTimeAgo(entry.created_at!)}</span>
              </div>
            </header>

            {/* Media Section */}
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
              <div className="mb-8 bg-gray-100 dark:bg-gray-900/50 p-4 rounded-lg">
                <audio controls className="w-full">
                  <source src={audioUrl} type="audio/webm" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Content Section */}
            <div className="prose prose-lg dark:prose-invert text-text-light dark:text-text-dark max-w-none leading-relaxed whitespace-pre-wrap">
              {entry.content}
            </div>

            {/* Metadata Footer */}
            <footer className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-4 text-sm text-gray-600 dark:text-gray-300">
                <div className="flex items-center gap-2 font-medium">
                  <Smile size={16} className="text-indigo-500" />
                  <span>Mood Score:</span>
                  <span className="text-gray-900 dark:text-white">
                    {entry.mood_score}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <AudioLines size={16} className="text-indigo-500" />
                  <span>Sentiment:</span>
                  <span className="text-gray-900 dark:text-white">
                    {entry.sentiment_score?.toFixed(2)}
                  </span>
                </div>
                {moodTags.length > 0 && (
                  <div className="flex items-center gap-2 font-medium">
                    <Tags size={16} className="text-indigo-500" />
                    <span>Tags:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {moodTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 px-2.5 py-1 rounded-full text-xs font-semibold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </footer>
          </article>
        </div>
      </div>

      {/* Modals */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        type="goal"
      />
      <AnimatePresence>
        {showImageModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowImageModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative"
            >
              <button
                className="absolute -top-4 -right-4 text-white bg-black/50 rounded-full p-1.5 z-10"
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
