import { Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ExportSettings = () => {
  const navigate = useNavigate();
  const handleExport = () => {
    navigate("/data-export");
  };

  return (
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Data Export
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Download a copy of your journal and user data.
        </p>
      </div>
      <div className="p-6">
        <p className="text-text-light-sub dark:text-text-dark-sub mb-6">
          You can export all your journal entries and user data for backup or
          migration purposes. The data will be provided in a standard JSON
          format.
        </p>
        <div className="flex justify-end">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 transition-all"
          >
            <Download size={16} /> Export All Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportSettings;
