import { useEffect, useState } from "react";
import api from "../api/axios";
import {
  AlertTriangle,
  Camera,
  CheckCircle,
  Clock,
  XCircle,
  Award,
  UploadCloud,
  X,
  Target,
  WifiOff, // Added for offline state
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ChallengeSkeleton from "../components/Skeletons/ChallengeSkeleton"; // Adjust path if necessary

interface ChallengeData {
  id: number;
  title: string;
  description: string;
  challenge_date: string;
  benefits: string[];
}

// --- NEW: Offline State Component ---
const OfflineState = () => (
  <div className="lg:col-span-3">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl border border-gray-200 dark:border-gray-700 p-6 min-h-[24rem] flex flex-col items-center justify-center text-center"
    >
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <WifiOff
          size={64}
          className="mx-auto text-gray-400 dark:text-gray-500 mb-4"
        />
      </motion.div>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
        Feature is Offline
      </h3>
      <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-sm">
        Daily Challenges are updated each day and require an internet connection
        to sync. Please connect to the internet to participate.
      </p>
    </motion.div>
  </div>
);

const DailyChallenge = () => {
  const [challengeData, setChallengeData] = useState<ChallengeData | null>(
    null
  );
  const [challengeState, setChallengeState] = useState<
    "pending" | "accepted" | "completed" | "expired"
  >("pending");
  const [timeLeft, setTimeLeft] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [submittedImageUrl, setSubmittedImageUrl] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // --- Check for authMode ---
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  useEffect(() => {
    // Only fetch data if in online mode
    if (authMode === "online") {
      const fetchDailyChallenge = async () => {
        setIsLoading(true);
        try {
          const { data: challenge } = await api.get("/challenges/today");
          setChallengeData(challenge);

          const { data: status } = await api.get(`/challenges/status`);
          const { accepted_at, completed_at, image_key } = status;

          if (completed_at) {
            setChallengeState("completed");
            if (image_key) {
              const { data: urlData } = await api.get(
                `/challenges/image-url?key=${image_key}`
              );
              setSubmittedImageUrl(urlData.url);
            }
          } else if (accepted_at) {
            setChallengeState("accepted");
          } else {
            const now = new Date();
            const acceptanceDeadline = new Date(now);
            acceptanceDeadline.setHours(20, 0, 0, 0);
            if (now > acceptanceDeadline) {
              setChallengeState("expired");
            } else {
              setChallengeState("pending");
            }
          }
        } catch (err) {
          console.error("Failed to load challenge", err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchDailyChallenge();
    } else {
      // If offline, stop loading immediately
      setIsLoading(false);
    }
  }, [authMode]);

  useEffect(() => {
    if (authMode === "offline") return; // Don't run timers offline

    const timerId = setInterval(() => {
      const now = new Date();
      let deadline: Date;
      let isExpired = false;

      if (challengeState === "pending") {
        deadline = new Date(now);
        deadline.setHours(20, 0, 0, 0);
        if (now > deadline) isExpired = true;
      } else if (challengeState === "accepted") {
        deadline = new Date(now);
        deadline.setHours(23, 59, 59, 999);
        if (now > deadline) isExpired = true;
      } else {
        setTimeLeft("");
        return;
      }

      if (isExpired) {
        setChallengeState("expired");
        setTimeLeft("00:00:00");
        return;
      }

      const diffMs = deadline.getTime() - now.getTime();
      const hours = Math.floor(diffMs / 3600000)
        .toString()
        .padStart(2, "0");
      const minutes = Math.floor((diffMs % 3600000) / 60000)
        .toString()
        .padStart(2, "0");
      const seconds = Math.floor((diffMs % 60000) / 1000)
        .toString()
        .padStart(2, "0");
      setTimeLeft(`${hours}:${minutes}:${seconds}`);
    }, 1000);

    return () => clearInterval(timerId);
  }, [challengeState, authMode]);

  const handleAccept = async () => {
    if (!challengeData) return;
    try {
      await api.post("/challenges/accept", { challenge_id: challengeData.id });
      setChallengeState("accepted");
    } catch (err) {
      console.error("Failed to accept challenge", err);
    }
  };

  const processImageFile = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const handleSubmitProof = async () => {
    if (!selectedImage || !challengeData) return;
    try {
      const { data } = await api.get(
        `/challenges/upload?type=${selectedImage.type}&challenge_id=${challengeData.id}`
      );
      await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": selectedImage.type },
        body: selectedImage,
      });
      await api.put("/challenges/complete", {
        challenge_id: challengeData.id,
        image_key: data.key,
      });
      setChallengeState("completed");
      setSubmittedImageUrl(URL.createObjectURL(selectedImage)); // Optimistic update for preview
    } catch (err) {
      console.error("Upload error", err);
    }
  };

  if (isLoading) {
    return <ChallengeSkeleton />;
  }

  const renderContent = () => {
    switch (challengeState) {
      case "expired":
        return (
          <div className="text-center">
            <XCircle size={64} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              Challenge Expired
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              You missed today's challenge. Come back tomorrow for a new one!
            </p>
          </div>
        );
      case "completed":
        return (
          <div className="text-center">
            <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              Challenge Completed!
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Great job! Come back tomorrow for your next challenge.
            </p>
            {submittedImageUrl && (
              <img
                src={submittedImageUrl}
                alt="Submitted proof"
                className="w-full h-48 object-cover rounded-lg mt-6 shadow-md"
              />
            )}
          </div>
        );
      case "accepted":
        return (
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {challengeData?.title}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {challengeData?.description}
            </p>
            {previewUrl ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-full h-48">
                  <img
                    src={previewUrl}
                    alt="Proof preview"
                    className="w-full h-full object-cover rounded-lg shadow-md"
                  />
                  <button
                    onClick={() => {
                      setSelectedImage(null);
                      setPreviewUrl(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full"
                  >
                    <X size={16} />
                  </button>
                </div>
                <button
                  onClick={handleSubmitProof}
                  className="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
                >
                  Submit Proof
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <UploadCloud
                  size={32}
                  className={`mb-2 ${
                    isDragging ? "text-indigo-500" : "text-gray-400"
                  }`}
                />
                <span className="text-sm font-semibold">
                  {isDragging ? "Drop image here" : "Upload Proof"}
                </span>
                <p className="text-xs text-gray-500">Click or drag & drop</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            )}
          </div>
        );
      case "pending":
      default:
        return (
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {challengeData?.title}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {challengeData?.description}
            </p>
            <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-lg p-4 mb-6 text-left">
              <h4 className="font-semibold text-indigo-800 dark:text-indigo-200 mb-2 flex items-center gap-2">
                <Award size={18} /> Benefits
              </h4>
              <ul className="space-y-1 text-sm text-indigo-700 dark:text-indigo-300">
                {challengeData?.benefits.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={handleAccept}
              className="w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Accept Challenge
            </button>
          </div>
        );
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-slate-900 min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            Daily Challenge
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 mt-1">
            A new challenge each day to promote well-being.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          {/* --- Conditional Rendering based on authMode --- */}
          {authMode === "offline" ? (
            <OfflineState />
          ) : (
            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl border border-gray-200 dark:border-gray-700">
                <div className="p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    Today's Challenge
                  </h2>
                  <div className="flex items-center gap-2 text-sm font-mono px-3 py-1.5 bg-gray-100 dark:bg-gray-900/50 rounded-full">
                    <Clock size={16} className="text-indigo-500" />
                    <span className="text-gray-800 dark:text-gray-200">
                      {timeLeft}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      left
                    </span>
                  </div>
                </div>
                <div className="p-6 min-h-[24rem] flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={challengeState}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="w-full"
                    >
                      {renderContent()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          )}

          {/* How It Works Panel */}
          <aside className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                How It Works
              </h2>
              <ul className="space-y-4">
                {[
                  {
                    num: 1,
                    title: "Accept the Challenge",
                    desc: "A new challenge appears daily. Accept it before 8 PM to participate.",
                  },
                  {
                    num: 2,
                    title: "Complete It",
                    desc: "Follow the instructions and complete the task before midnight.",
                  },
                  {
                    num: 3,
                    title: "Submit Proof",
                    desc: "Upload a photo as proof to build your completion streak.",
                  },
                ].map((step) => (
                  <li key={step.num} className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full font-bold">
                      {step.num}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-800 dark:text-gray-200">
                        {step.title}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {step.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-6 bg-yellow-50 dark:bg-yellow-500/10 border-l-4 border-yellow-400 dark:border-yellow-500 p-4 rounded-r-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      You must accept by 8 PM and complete by midnight to
                      maintain your streak.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default DailyChallenge;
