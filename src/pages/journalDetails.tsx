import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  PencilIcon,
  Trash2Icon,
  CalendarIcon,
  SmileIcon,
  AudioLinesIcon,
  ImageIcon,
} from "lucide-react";
import journalService, { type JournalEntry } from "../api/journalService";
import { useAuth } from "../hooks/useAuth";
import { formatTimeAgo } from "../utils/DateFormatter";

export default function JournalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showImageModal, setShowImageModal] = useState(false);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { accessToken } = useAuth();

  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  useEffect(() => {
    const fetchEntry = async () => {
      const res = await journalService.getOne(authMode, accessToken!, +id!);
      setEntry(res);
      console.log("calling getImage with: ", res.image_key);
      if (res.image_key) {
        await window.electron.ipcRenderer
          .invoke("media:getImage", res.image_key.toString())
          .then((res) => {
            setImageUrl(res);
          });
      }
      if(res.audio_key) {
        await window.electron.ipcRenderer
          .invoke("media:getAudio", res.audio_key.toString())
          .then((res) => {
            setAudioUrl(res);
          });
      }
      //   const imageRes = await journalService.getMediaUrl(res.data.image_key);
      //   setImageUrl(imageRes.url);
      // }
      // if (res.audio_key) {
      //   const audioRes = await journalService.getMediaUrl(res.data.audio_key);
      //   setAudioUrl(audioRes.url);
      // }
    };

    fetchEntry();
  }, [id]);

  const handleEdit = () => {
    navigate(`/journal/edit/${id}`);
  };

  const handleDelete = async () => {
    const confirm = window.confirm(
      "Are you sure you want to delete this entry?"
    );
    if (confirm) {
      await journalService.remove(authMode, accessToken!, +id!);
      navigate("/journals");
    }
  };

  if (!entry) return <div className="p-6 text-gray-600">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 mt-6 bg-white shadow-xl rounded-2xl">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {entry.title}
          </h1>
          <div className="text-sm text-zinc-500 flex items-center gap-1 mt-1">
            <CalendarIcon className="w-4 h-4" />
            {formatTimeAgo(entry.created_at!)}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleEdit}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-blue-600 hover:bg-blue-50 border border-blue-600"
          >
            <PencilIcon className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-red-600 hover:bg-red-50 border border-red-600"
          >
            <Trash2Icon className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Image with modal preview */}
      {entry.image_key && (
        <>
          <div className="mb-4">
            <img
              src={imageUrl}
              alt="Journal visual"
              className="w-[300px] h-[200px] object-cover rounded-xl cursor-pointer"
              onClick={() => setShowImageModal(true)}
            />
          </div>

          {showImageModal && (
            <div
              className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
              onClick={() => setShowImageModal(false)} // Close on background click
            >
              <div
                className="relative"
                onClick={(e) => e.stopPropagation()} // Prevent close on image click
              >
                <button
                  className="absolute top-2 right-2 text-white text-2xl font-bold hover:text-red-400"
                  onClick={() => setShowImageModal(false)}
                >
                  ×
                </button>
                <img
                  src={imageUrl}
                  alt="Full View"
                  className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-lg"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Audio */}
      {audioUrl && (
        <div className="mb-4">
          <audio controls className="w-full">
            <source src={audioUrl} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {/* Content */}
      <div className="prose dark:prose-invert max-w-none mb-6 text-zinc-800">
        <p>{entry.content}</p>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-600">
        <div className="flex items-center gap-1">
          <SmileIcon className="w-4 h-4" />
          Mood Score:{" "}
          <span className="font-medium ml-1">{entry.mood_score}</span>
        </div>
        <div className="flex items-center gap-1">
          <AudioLinesIcon className="w-4 h-4" />
          Sentiment Score:{" "}
          <span className="font-medium ml-1">{entry.sentiment_score}</span>
        </div>
        {JSON.parse(entry.mood_tags!).length > 0 && (
          <div className="flex items-center gap-1">
            <ImageIcon className="w-4 h-4" />
            Tags:
            {JSON.parse(entry.mood_tags!).map((tag, idx) => (
              <span
                key={idx}
                className="bg-zinc-200 text-zinc-800 px-2 py-0.5 rounded-full text-xs ml-1"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
