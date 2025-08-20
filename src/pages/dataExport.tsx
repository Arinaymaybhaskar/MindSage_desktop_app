// src/pages/DataExportPage.tsx (assuming new file location)
import { useState } from "react";
import { Download, Clock, Check, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

const DataExportPage = () => {
  const [requestSent, setRequestSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleExportRequest = () => {
    setIsLoading(true);
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
    <div className="bg-base-light dark:bg-base-dark min-h-screen">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-text-light dark:text-text-dark">
            Export Your Data
          </h1>
          <p className="text-lg text-text-light-sub dark:text-text-dark-sub mt-2">
            Download a complete copy of your journal and user data.
          </p>
        </header>

        <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
          <div className="p-6 sm:p-8">
            <p className="text-text-light-sub dark:text-text-dark-sub mb-4">
              You can request a complete export of all your data, which
              includes:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-6 text-text-light-sub dark:text-text-dark-sub">
              <li>All journal entries and their content</li>
              <li>Profile information and account settings</li>
              <li>Completed challenges and goal progress</li>
              <li>Media attachments (images and audio)</li>
            </ul>

            {/* Themed Info Box */}
            <div className="bg-info/10 border-l-4 border-info p-4 rounded-r-lg mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Clock className="h-5 w-5 text-info" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-semibold text-info/90 dark:text-info/80">
                    Processing Time
                  </h3>
                  <p className="text-sm text-info/80 dark:text-info/70 mt-1">
                    Data exports can take up to 24 hours. You'll receive an
                    email with a secure download link when it's ready.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center text-center border-t border-border-light dark:border-border-dark pt-6">
              {requestSent ? (
                <div className="flex items-center gap-3 px-6 py-3 text-sm font-semibold text-success bg-success/10 rounded-lg">
                  <Check size={18} />
                  <span>Request Sent! Check your email.</span>
                </div>
              ) : (
                <button
                  onClick={handleExportRequest}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
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
      </main>
    </div>
  );
};

export default DataExportPage;
