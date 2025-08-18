// src/components/settings/ExportSettings.tsx
import React from "react";
import { Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ExportSettings = () => {
  const navigate = useNavigate();
  const handleExport = () => {
    navigate("/data-export");
  };

  return (
    <div className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl border border-gray-200 dark:border-gray-700">
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
          You can export all your journal entries and user data for backup or
          migration purposes. The data will be provided in a standard JSON
          format.
        </p>
        <div className="flex justify-end">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all"
          >
            <Download size={16} /> Export All Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportSettings;
