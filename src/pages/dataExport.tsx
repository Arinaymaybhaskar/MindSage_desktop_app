// src/components/settings/ExportSettings.tsx
import { useState } from "react";
import { Download, Clock, Check, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

const ExportSettings = () => {
  const [requestSent, setRequestSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleExportRequest = () => {
    setIsLoading(true);
    // In a real app, this would be your API call.
    // We simulate it with a promise that resolves after a delay.
    toast
      .promise(new Promise((resolve) => setTimeout(resolve, 2000)), {
        loading: "Submitting your export request...",
        success: () => {
          setRequestSent(true);
          return "Request received! We will email you a download link.";
        },
        error: "Failed to request export. Please try again.",
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <div className="w-full flex justify-center items-center">
      <div className="justify-center items-center bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl m-5 mt-10 border max-w-7xl border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Data Export
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Download a copy of your journal and user data.
          </p>
        </div>
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            You can request a complete export of all your data, which includes:
          </p>
          <ul className="list-disc list-inside space-y-2 mb-6 text-gray-600 dark:text-gray-300">
            <li>All journal entries and their content</li>
            <li>Profile information and account settings</li>
            <li>Completed challenges and goal progress</li>
            <li>Media attachments (images and audio)</li>
          </ul>

          <div className="bg-blue-50 dark:bg-blue-500/10 border-l-4 border-blue-400 dark:border-blue-500 p-4 rounded-r-lg mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                  Processing Time
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Data exports can take up to 24 hours. You'll receive an email
                  with a secure download link when it's ready.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center text-center border-t border-gray-200 dark:border-gray-700 pt-6">
            {requestSent ? (
              <div className="flex items-center gap-3 px-6 py-3 text-sm font-semibold text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-500/10 rounded-lg">
                <Check size={18} />
                <span>Request Sent! Check your email.</span>
              </div>
            ) : (
              <button
                onClick={handleExportRequest}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Download size={18} />
                )}
                <span>
                  {isLoading ? "Processing..." : "Request Full Data Export"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportSettings;
