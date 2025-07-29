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
import dayjs from "dayjs";

export default function JournalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchEntry = async () => {
      const res = await journalService.getOne(+id!);
      setEntry(res.data);

      if (res.data.image_key) {
        const imageRes = await journalService.getMediaUrl(res.data.image_key);
        setImageUrl(imageRes.data.url);
      }
      if (res.data.audio_key) {
        const audioRes = await journalService.getMediaUrl(res.data.audio_key);
        setAudioUrl(audioRes.data.url);
      }
    };

    fetchEntry();
  }, [id]);

  const handleEdit = () => {
    navigate(`/journal/edit/${id}`);
  };

  const handleDelete = async () => {
    const confirm = window.confirm("Are you sure you want to delete this entry?");
    if (confirm) {
      await journalService.remove(+id!)
      navigate("/journals");
    }
  };

  if (!entry) return <div className="p-6 text-gray-600">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 mt-6 bg-white shadow-xl rounded-2xl">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{entry.title}</h1>
          <div className="text-sm text-zinc-500 flex items-center gap-1 mt-1">
            <CalendarIcon className="w-4 h-4" />
            {new Date(entry.created_at!).toDateString() ===
                  new Date().toDateString()
                    ? "Today"
                    : dayjs(entry.created_at!).format("MMMM D, YYYY")}
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

      {/* Image */}
      {imageUrl && (
        <div className="mb-4">
          <img
            src={imageUrl}
            alt="Journal visual"
            className="w-full h-auto rounded-xl object-cover"
          />
        </div>
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
          Mood Score: <span className="font-medium ml-1">{entry.mood_score}</span>
        </div>
        <div className="flex items-center gap-1">
          <AudioLinesIcon className="w-4 h-4" />
          Sentiment Score: <span className="font-medium ml-1">{entry.sentiment_score}</span>
        </div>
        {entry.mood_tags!.length > 0 && (
          <div className="flex items-center gap-1">
            <ImageIcon className="w-4 h-4" />
            Tags:
            {entry.mood_tags!.map((tag, idx) => (
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
