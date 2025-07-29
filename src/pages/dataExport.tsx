import { useState } from 'react';
import { DownloadIcon, ClockIcon, CheckIcon } from 'lucide-react';
const DataExport = () => {
  const [requestSent, setRequestSent] = useState(false);
  const handleExportRequest = () => {
    // In a real app, this would make an API call to request data export
    setRequestSent(true);
  };
  return <div className="py-6 m-3 mx-10">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        Export Your Data
      </h1>
      <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            About Data Exports
          </h2>
        </div>
        <div className="p-6">
          <p className="text-gray-600 mb-4">
            You can export all your data from MindSage, including:
          </p>
          <ul className="list-disc pl-5 mb-6 text-gray-600 space-y-1">
            <li>All journal entries</li>
            <li>Profile information</li>
            <li>Completed challenges</li>
            <li>Account settings</li>
            <li>Usage statistics</li>
          </ul>
          <p className="text-gray-600 mb-4">
            Your data will be exported as a ZIP file containing JSON files that
            you can save for backup or import into other compatible services.
          </p>
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <ClockIcon className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Processing Time
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  Data exports typically take 24-48 hours to process. You'll
                  receive an email with a download link when your export is
                  ready.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            Request Data Export
          </h2>
        </div>
        <div className="p-6">
          {!requestSent ? <>
              <p className="text-gray-600 mb-6">
                Click the button below to request a full export of your data.
                We'll send you an email with a download link when it's ready.
              </p>
              <button onClick={handleExportRequest} className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                <DownloadIcon className="h-5 w-5 mr-2" />
                Request Data Export
              </button>
            </> : <div className="bg-green-50 border-l-4 border-green-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <CheckIcon className="h-5 w-5 text-green-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Export Request Received
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    Your data export request has been received. You'll receive
                    an email with a download link
                    within 24-48 hours.
                  </p>
                </div>
              </div>
            </div>}
        </div>
      </div>
    </div>;
};
export default DataExport;