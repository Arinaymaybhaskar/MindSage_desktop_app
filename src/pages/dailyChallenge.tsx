import { useEffect, useState } from "react";
import api from "../api/axios";
import {
  AlertCircleIcon,
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react";

interface ChallengeData {
  id: number;
  title: string;
  description: string;
  challenge_date: string;
  benefits: string[];
}

const DailyChallenge = () => {
  const [challengeData, setChallengeData] = useState<ChallengeData | null>(
    null
  );
  const [challengeState, setChallengeState] = useState<
    "pending" | "accepted" | "completed" | "expired"
  >("pending");
  const [acceptanceTimeLeft, setAcceptanceTimeLeft] = useState<string>("");
  const [completionTimeLeft, setCompletionTimeLeft] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [submittedImageUrl, setSubmittedImageUrl] = useState<string | null>(
    null
  );

  useEffect(() => {
    const fetchDailyChallenge = async () => {
      try {
        const res = await api.get("/challenges/today");
        setChallengeData(res.data);
        // Optional: Check if already accepted
        const acceptedRes = await api.get(`/challenges/status`);
        const { accepted_at, completed_at, image_key } = acceptedRes.data;

        if (completed_at) {
          setChallengeState("completed");
          if (image_key) {
            const signedUrlRes = await api.get(
              `/challenges/image-url?key=${image_key}`
            );
            setSubmittedImageUrl(signedUrlRes.data.url);
          }
        } else if (accepted_at) {
          setChallengeState("accepted");
        } else {
          setChallengeState("pending");
        }
      } catch (err) {
        console.error("Failed to load challenge", err);
      }
    };
    fetchDailyChallenge();
  }, []);

  const handleSubmitProof = async () => {
    if (selectedImage && challengeData) {
      try {
        // Get signed URL
        const { data } = await api.get(
          `/challenges/upload?type=${selectedImage.type}&challenge_id=${challengeData?.id}`
        );

        // Upload to S3
        await fetch(data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": selectedImage.type },
          body: selectedImage,
        });

        // Save image key
        await api.put("/challenges/complete", {
          challenge_id: challengeData?.id,
          image_key: data.key,
        });
        setChallengeState("completed");
      } catch (err) {
        console.error("Upload error", err);
      }
    }
  };

  useEffect(() => {
    const updateTimers = () => {
      const now = new Date();
      // Calculate acceptance deadline (8 PM today)
      const acceptanceDeadline = new Date(now);
      acceptanceDeadline.setHours(20, 0, 0, 0);
      // Calculate completion deadline (midnight tonight)
      const completionDeadline = new Date(now);
      completionDeadline.setHours(23, 59, 59, 999);
      // If current time is past 8 PM and challenge is not accepted, mark as expired
      if (now > acceptanceDeadline && challengeState === "pending") {
        setChallengeState("expired");
        return;
      }
      // If current time is past midnight and challenge is accepted but not completed, mark as expired
      if (now > completionDeadline && challengeState === "accepted") {
        setChallengeState("expired");
        return;
      }
      // Calculate time left for acceptance
      if (now < acceptanceDeadline) {
        const diffMs = acceptanceDeadline.getTime() - now.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setAcceptanceTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setAcceptanceTimeLeft("0h 0m");
      }
      // Calculate time left for completion
      if (now < completionDeadline) {
        const diffMs = completionDeadline.getTime() - now.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setCompletionTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setCompletionTimeLeft("0h 0m");
      }
    };
    // Update immediately
    updateTimers();
    // Update every minute
    const timerId = setInterval(updateTimers, 60000);
    return () => clearInterval(timerId);
  }, [challengeState]);

  const handleAccept = async () => {
    if (!challengeData) return;
    try {
      await api.post("/challenges/accept", { challenge_id: challengeData.id });
      setChallengeState("accepted");
    } catch (err) {
      console.error("Failed to accept challenge", err);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && challengeData) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  return (
    <div className="py-6 m-3 mx-10">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        Daily Challenge
      </h1>
      <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">
              Today's Challenge
            </h2>
            <div className="flex items-center">
              <ClockIcon className="h-5 w-5 text-indigo-500 mr-2" />
              {challengeState === "pending" ? (
                <span className="text-sm font-medium">
                  Accept by:{" "}
                  <span className="text-indigo-600">
                    {acceptanceTimeLeft} left
                  </span>
                </span>
              ) : challengeState === "accepted" ? (
                <span className="text-sm font-medium">
                  Complete by:{" "}
                  <span className="text-indigo-600">
                    {completionTimeLeft} left
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="p-6">
          {challengeState === "expired" ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <XCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Challenge Expired
              </h3>
              <p className="text-gray-600 mb-4">
                You missed today's challenge. Come back tomorrow for a new
                opportunity!
              </p>
              <p className="text-sm text-gray-500">
                New challenges are available at midnight every day.
              </p>
            </div>
          ) : challengeState === "completed" ? (
            <div className="flex items-center justify-between">
              <div className="bg-green-50 border w-1/2 border-green-200 rounded-lg p-6 text-center">
                <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Challenge Completed!
                </h3>
                <p className="text-gray-600 mb-4">
                  Congratulations on completing today's challenge. Your streak
                  is now +1 days!
                </p>

                <p className="text-sm text-gray-500 mt-4">
                  Come back tomorrow for a new challenge.
                </p>
              </div>
              {submittedImageUrl && (
                <div className="mt-4 w-1/2">
                  <img
                    src={submittedImageUrl}
                    alt="Submitted proof"
                    className="w-64 h-64 object-cover rounded-lg mx-auto shadow"
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              <h3 className="text-xl font-medium text-gray-900 mb-3">
                {challengeData?.title}
              </h3>
              <p className="text-gray-600 mb-6">{challengeData?.description}</p>
              {challengeData?.benefits && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-indigo-800 mb-2">
                    Benefits
                  </h4>
                  <ul className="space-y-1">
                    {challengeData?.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start">
                        <CheckCircleIcon className="h-5 w-5 text-indigo-500 mr-2 flex-shrink-0" />
                        <span className="text-sm text-indigo-700">
                          {benefit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {challengeState === "pending" ? (
                <div className="flex justify-center">
                  <button
                    onClick={handleAccept}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    Accept Challenge
                  </button>
                </div>
              ) : (
                <div className="border-t border-gray-200 pt-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">
                    Submit Your Proof
                  </h4>
                  {!previewUrl ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <CameraIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 mb-4">
                        Upload a photo as proof of completing the challenge
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                        id="photo-upload"
                      />
                      <label
                        htmlFor="photo-upload"
                        className="inline-block px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        Select Photo
                      </label>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="relative w-64 h-64 mx-auto mb-4">
                        <img
                          src={previewUrl}
                          alt="Challenge proof"
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <button
                          onClick={() => {
                            setSelectedImage(null);
                            setPreviewUrl(null);
                          }}
                          className="absolute top-2 right-2 p-1 bg-white rounded-full shadow"
                        >
                          <XCircleIcon className="h-5 w-5 text-gray-500" />
                        </button>
                      </div>
                      <button
                        onClick={handleSubmitProof}
                        className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        Submit Proof
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">How It Works</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold">1</span>
              </div>
              <h3 className="font-medium mb-2">Accept the Challenge</h3>
              <p className="text-sm text-gray-600">
                Each day brings a new challenge. Accept it before 8 PM to
                participate.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold">2</span>
              </div>
              <h3 className="font-medium mb-2">Complete It</h3>
              <p className="text-sm text-gray-600">
                Follow the instructions and complete the challenge before
                midnight.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold">3</span>
              </div>
              <h3 className="font-medium mb-2">Submit Proof</h3>
              <p className="text-sm text-gray-600">
                Upload a photo as proof and build your streak of completed
                challenges.
              </p>
            </div>
          </div>
          <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertCircleIcon className="h-5 w-5 text-yellow-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Important
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  You must accept the challenge before 8 PM and complete it
                  before midnight to maintain your streak.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyChallenge;
