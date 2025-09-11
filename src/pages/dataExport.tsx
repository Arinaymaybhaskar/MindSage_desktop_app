import { useState } from "react";
import { Download, Check, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const DataExportPage = () => {
  const [requestSent, setRequestSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { accessToken } = useAuth();
  const authMode = (localStorage.getItem("authMode") || "offline") as
    | "offline"
    | "online";

  const handleExport = async () => {
    setIsLoading(true);
    try {
      // Step 1: Ask the user where to save the file BEFORE generating it.
      const saveDialogResult = await window.electron.ipcRenderer.invoke(
        "dialog:show-save-export"
      );

      // Step 2: If the user selected a path (didn't cancel), proceed.
      if (!saveDialogResult.canceled && saveDialogResult.filePath) {
        // Step 3: Call the export handler, now passing the chosen file path.
        const exportResult = await window.electron.ipcRenderer.invoke(
          "user:export-data",
          authMode,
          accessToken!,
          saveDialogResult.filePath // Pass the destination path
        );

        if (exportResult.success) {
          setRequestSent(true); // The file was generated and saved successfully.
        } else {
          console.error("Data export generation failed:", exportResult.error);
          // TODO: Show an error notification to the user
        }
      }
      // If the user canceled the dialog, we simply do nothing.
    } catch (error) {
      console.error("Error during data export process:", error);
      // TODO: Show a generic error notification to the user
    } finally {
      setIsLoading(false);
    }
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

            <div className="bg-info/10 border-l-4 border-info p-4 rounded-r-lg mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Download className="h-5 w-5 text-info" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-semibold text-info/90 dark:text-info/80">
                    Direct Download
                  </h3>
                  <p className="text-sm text-info/80 dark:text-info/70 mt-1">
                    Click the button below to choose a location and save your
                    complete data export as a ZIP file.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center text-center border-t border-border-light dark:border-border-dark pt-6">
              {requestSent ? (
                <div className="flex items-center gap-3 px-6 py-3 text-sm font-semibold text-success bg-success/10 rounded-lg">
                  <Check size={18} />
                  <span>Export saved successfully!</span>
                </div>
              ) : (
                <button
                  onClick={handleExport}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Download size={18} />
                  )}
                  <span>
                    {isLoading
                      ? "Generating Export..."
                      : "Export and Save Data"}
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
