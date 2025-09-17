import { useEffect, useState } from "react";
import api from "../api/axios";
import {
  AlertTriangle,
  Award,
  CheckCircle,
  Clock,
  UploadCloud,
  X,
  XCircle,
  WifiOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ChallengeSkeleton from "../components/Skeletons/ChallengeSkeleton";

interface ChallengeData {
  id: number;
  title: string;
  description: string;
  benefits: string[];
}

// --- Themed Offline State Component ---
const OfflineState = () => (
  <div className="lg:w-3/5">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark p-6 min-h-[24rem] flex flex-col items-center justify-center text-center h-full"
    >
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <WifiOff
          size={64}
          className="mx-auto text-text-light-sub dark:text-text-dark-sub mb-4"
        />
      </motion.div>
      <h3 className="text-2xl font-bold text-text-light dark:text-text-dark">
        Feature is Offline
      </h3>
      <p className="text-text-light-sub dark:text-text-dark-sub mt-2 max-w-sm">
        Daily Challenges require an internet connection to sync. Please connect
        to the internet to participate.
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
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  // All component logic (useEffect, handlers) remains the same
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
            <XCircle size={64} className="mx-auto text-danger mb-4" />
            <h3 className="text-2xl font-bold text-text-light dark:text-text-dark">
              Challenge Expired
            </h3>
            <p className="text-text-light-sub dark:text-text-dark-sub mt-2">
              You missed today's challenge. Come back tomorrow for a new one!
            </p>
          </div>
        );
      case "completed":
        return (
          <div className="text-center">
            <CheckCircle size={64} className="mx-auto text-success mb-4" />
            <h3 className="text-2xl font-bold text-text-light dark:text-text-dark">
              Challenge Completed!
            </h3>
            <p className="text-text-light-sub dark:text-text-dark-sub mt-2">
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
            <h3 className="text-2xl font-bold text-text-light dark:text-text-dark mb-2">
              {challengeData?.title}
            </h3>
            <p className="text-text-light-sub dark:text-text-dark-sub mb-6">
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
                    className="absolute top-2 right-2 p-1.5 bg-base-dark/60 text-text-dark rounded-full hover:bg-base-dark/80 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <button
                  onClick={handleSubmitProof}
                  className="w-full px-6 py-3 bg-success text-white font-semibold rounded-lg hover:bg-success/90 transition-colors"
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
                    ? "border-info bg-light1 dark:bg-dark1/10"
                    : "border-border-light dark:border-border-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
                }`}
              >
                <UploadCloud
                  size={32}
                  className={`mb-2 transition-colors ${
                    isDragging
                      ? "text-dark1 dark:text-light1"
                      : "text-text-light-sub dark:text-text-dark-sub"
                  }`}
                />
                <span className="text-sm font-semibold text-text-light dark:text-text-dark">
                  {isDragging ? "Drop image here" : "Upload Proof"}
                </span>
                <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                  Click or drag & drop
                </p>
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
            <h3 className="text-2xl font-bold text-text-light dark:text-text-dark mb-2">
              {challengeData?.title}
            </h3>
            <p className="text-text-light-sub dark:text-text-dark-sub mb-6">
              {challengeData?.description}
            </p>
            <div className="bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg p-4 mb-6 text-left">
              <h4 className="font-semibold text-dark1 dark:text-light1 mb-2 flex items-center gap-2">
                <Award size={18} /> Benefits
              </h4>
              <ul className="space-y-1 text-sm text-dark1 dark:text-light1/90">
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
              className="w-full px-6 py-3 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg hover:bg-light1 dark:bg-dark1/90 transition-colors"
            >
              Accept Challenge
            </button>
          </div>
        );
    }
  };

  return (
    <div className="bg-base-light dark:bg-base-dark min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-text-light dark:text-text-dark">
            Daily Challenge
          </h1>
          <p className="text-lg text-text-light-sub dark:text-text-dark-sub mt-1">
            A new challenge each day to promote well-being.
          </p>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          {authMode === "offline" ? (
            <OfflineState />
          ) : (
            <div className="w-full lg:w-3/5">
              <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark h-full flex flex-col">
                <div className="p-4 flex justify-between items-center border-b border-border-light dark:border-border-dark">
                  <h2 className="font-semibold text-text-light dark:text-text-dark">
                    Today's Challenge
                  </h2>
                  <div className="flex items-center gap-2 text-sm font-mono px-3 py-1.5 bg-tertiary-light dark:bg-tertiary-dark rounded-full">
                    <Clock size={16} className="text-dark1 dark:text-light1" />
                    <span className="text-text-light dark:text-text-dark">
                      {timeLeft}
                    </span>
                    <span className="text-text-light-sub dark:text-text-dark-sub">
                      left
                    </span>
                  </div>
                </div>
                <div className="p-6 flex-grow flex items-center justify-center">
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

          <aside className="w-full lg:w-2/5">
            <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark p-6 h-full">
              <h2 className="text-xl font-bold text-text-light dark:text-text-dark mb-4">
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
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-tertiary-light dark:bg-tertiary-dark text-dark1 dark:text-light1 rounded-full font-bold">
                      {step.num}
                    </div>
                    <div>
                      <h4 className="font-semibold text-text-light dark:text-text-dark">
                        {step.title}
                      </h4>
                      <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
                        {step.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-6 bg-warning/10 border-l-4 border-warning p-4 rounded-r-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-warning" />
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
