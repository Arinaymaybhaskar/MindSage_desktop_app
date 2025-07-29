import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import journalService, { type JournalEntry } from "../api/journalService";
import { ArrowLeftIcon, BrainIcon, MicIcon, PaperclipIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MoodTagSelector } from "../components/moodOptions";
import { MoodSlider } from "../components/moodSlider";
import { FollowUpQuestions } from "../components/followUpQuestions";
import api from "../api/axios";
import { AudioPlayer } from "../components/ui/AudioPlayer";

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
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const handleImageUpload = (file: File) => {
    setImageFile(file);
  };

  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft && !id) {
      setEntry(JSON.parse(savedDraft));
    }
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    // get user settings for auto-save interval
    const userSettings = localStorage.getItem("userSettings");
    const autoSaveInterval = userSettings
      ? JSON.parse(userSettings).auto_save_interval
      : 1500;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(entry));
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }, autoSaveInterval);
    return () => clearTimeout(timer);
  }, [entry]);

  useEffect(() => {
    if (isEdit && id) {
      journalService.getOne(+id).then((res) => setEntry(res.data));
    }
  }, [id]);

  const uploadToS3 = async (
    file: File | Blob,
    type: string,
    userId: string,
    journalId: string
  ) => {
    const urlRes = await journalService.getUploadUrl(type, userId, journalId);
    await fetch(urlRes.data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": type },
      body: file,
    });
    return urlRes.data.key;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let res;
      if(isEdit && id) {
        console.log(id)
        res = await journalService.update(+id, {
          title: entry.title,
          content: entry.content,
          mood_score: entry.mood_score,
          sentiment_score: entry.sentiment_score,
          mood_tags: entry.mood_tags,
        });
      } else {
        res = await journalService.create({
          title: entry.title,
          content: entry.content,
          mood_score: entry.mood_score,
          sentiment_score: entry.sentiment_score,
          mood_tags: entry.mood_tags,
        });
      }

      const journalId = res.data.id;
      const userId = res.data.user_id;
      
      let imageKey: string | undefined;
      let audioKey: string | undefined;
      if(!imageKey && !audioKey) {
        navigate("/");
        return;
      } 
      if (imageFile) {
        imageKey = await uploadToS3(
          imageFile,
          imageFile.type,
          userId,
          journalId
        );
      }

      if (audioBlob) {
        audioKey = await uploadToS3(
          audioBlob,
          audioBlob.type || "audio/webm",
          userId,
          journalId
        );
      }
      console.log("Image key:", imageKey);
      console.log("Audio key:", audioKey);

      const payload = {
        ...entry,
        image_key: imageKey,
        audio_key: audioKey,
      };
      console.log("Submitting entry", payload);

      await journalService.update(journalId, payload);

      localStorage.removeItem(DRAFT_KEY);
      navigate("/");
    } catch (error) {
      console.error("❌ Submission error", error);
    }
  };

  const handleGenerateQuestions = async () => {
    setIsGeneratingQuestions(true);
    const prompt = `You are a compassionate and emotionally intelligent journaling assistant. A user has written the following journal entry. Based on it, generate 3 short, thoughtful follow-up questions that invites further reflection or emotional insight. Keep the questions concise — no more than one line.
                    Journal Entry: ${entry.content}
                    Your output should be a JSON array of strings, like this: ["Question 1", "Question 2", "Question 3"]`;

    try {
      const { data } = await api.post("/ai/gemini/text", { prompt });

      // Remove Markdown code block formatting if present
      let result = data.data.result?.trim() || "Couldn’t generate a question.";
      if (result.startsWith("```")) {
        result = result.replace(/```json|```/g, "").trim();
      }
      let questions: string[] = [];
      try {
        questions = JSON.parse(result);
      } catch {
        questions = [result];
      }
      setFollowUpQuestions(questions);
    } catch (error) {
      console.error("Error fetching AI question:", error);
      setFollowUpQuestions(["Error fetching question."]);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  return (
    <div className="flex w-full overflow-hidden ">
      <div className="h-full w-full flex flex-col p-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-gray-900">
            {isEdit ? "Edit Entry" : "New Journal Entry"}
          </h1>
          <Link
            to="/"
            className="flex items-center px-4 py-2 text-gray-600 hover:text-indigo-600 rounded-lg transition-all duration-200 hover:bg-gray-50 group"
          >
            <ArrowLeftIcon
              size={16}
              className="mr-2 transition-transform duration-200 group-hover:-translate-x-1"
            />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </Link>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col lg:flex-row gap-6 h-full"
        >
          {/* Left column */}
          <div className=" flex-1 bg-white rounded-xl shadow-md p-6 overflow-auto">
            <div className="mb-4 group">
              <label
                htmlFor="title"
                className="block text-xl font-medium text-gray-700 mb-1 transition-colors duration-200 group-focus-within:text-indigo-600"
              >
                Title
              </label>
              <input
                id="title"
                type="text"
                placeholder="Today's thoughts..."
                value={entry.title}
                onChange={(e) => setEntry({ ...entry, title: e.target.value })}
                className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm"
              />
            </div>
            <div className="mb-4 group flex-1">
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="content"
                  className="block text-xl font-medium text-gray-700 transition-colors duration-200 group-focus-within:text-indigo-600"
                >
                  Content
                </label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    className="flex items-center px-2 py-1 text-xs text-indigo-700 bg-indigo-50 rounded-full hover:bg-indigo-100 transition-all duration-200 hover:shadow-sm"
                    onClick={() => console.log("Speak")}
                  >
                    <MicIcon size={14} className="mr-1" />
                    Speak
                  </button>
                  <button
                    className={`flex items-center px-2 py-1 text-xs rounded-full transition-all duration-300 ${
                      isGeneratingQuestions
                        ? "text-indigo-700 bg-indigo-100 animate-pulse"
                        : "text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:shadow-sm"
                    }`}
                    type="button"
                    onClick={handleGenerateQuestions}
                    disabled={isGeneratingQuestions || !entry.content.trim()}
                  >
                    <BrainIcon
                      size={14}
                      className={`mr-1 ${
                        isGeneratingQuestions ? "animate-spin" : ""
                      }`}
                    />
                    {isGeneratingQuestions
                      ? "Generating..."
                      : "Get Follow-up Questions"}
                  </button>
                </div>
              </div>
              <textarea
                id="content"
                placeholder="Write freely..."
                value={entry.content}
                onChange={(e) =>
                  setEntry({ ...entry, content: e.target.value })
                }
                className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 shadow-sm h-full min-h-[200px]"
              />
            </div>
            {followUpQuestions.length > 0 && (
              <FollowUpQuestions questions={followUpQuestions} />
            )}
          </div>
          {/* Right column - Mood tracking and additional inputs */}
          <div className="lg:w-1/3 space-y-4 overflow-auto">
            <div className="bg-white rounded-xl shadow-md p-6 ">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                Mood Tracking
              </h2>
              <div className="flex items-center flex-col space-x-2 mb-3">
                <MoodSlider
                  value={entry.mood_score ?? 0}
                  onChange={(score) =>
                    setEntry({ ...entry, mood_score: score })
                  }
                />
                <MoodTagSelector
                  selected={entry.mood_tags ?? []}
                  onChange={(tags) => setEntry({ ...entry, mood_tags: tags })}
                />
                <div className="w-full mt-2">
                  <label className="text-gray-700 font-semibold">
                    Mood Tags
                  </label>
                  <input
                    name="mood_tags"
                    value={entry.mood_tags?.join(",")}
                    onChange={(e) =>
                      setEntry({
                        ...entry,
                        mood_tags: e.target.value.split(","),
                      })
                    }
                    placeholder="e.g., happy, stressed, motivated"
                    className="w-full mt-1 border border-gray-300 px-2 py-1 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Separate tags with commas
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Attachments
                </label>
                <div className="flex items-center space-x-2">
                  <label className="flex items-center px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-all duration-200 hover:border-indigo-300 group">
                    <PaperclipIcon
                      size={16}
                      className="mr-2 text-gray-500 group-hover:text-indigo-500 transition-colors duration-200"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-indigo-700 transition-colors duration-200">
                      Choose file
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e.target.files![0])}
                    />
                  </label>
                  <span className="text-sm text-gray-500">{imageFile ? imageFile.name : "No file chosen"}</span>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Audio Journal
                </label>
                <AudioPlayer setAudioBlob={setAudioBlob} />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-sm hover:shadow transform hover:-translate-y-0.5"
                onClick={() => console.log("Create entry")}
              >
                Create Entry
              </button>
            </div>
          </div>
        </form>

        {/* Follow-up Questions */}

        {/* ✅ Auto-Save Toast Notification */}
        <AnimatePresence>
          {showSaved && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              className="fixed bottom-6 right-6 bg-white border border-gray-200 shadow-md px-4 py-2 rounded-md text-gray-700 text-sm z-50"
            >
              ✅ Draft auto-saved
            </motion.div>
          )}
        </AnimatePresence>
      </div>{" "}
    </div>
  );
}
