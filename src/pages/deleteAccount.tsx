import React, { useState } from "react";
import { AlertCircleIcon, ArrowLeftIcon, LockIcon } from "lucide-react";
import api from "../api/axios";
export function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError("");
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Please enter your password");
      return;
    }
    setConfirmDelete(true);
  };

  const deleteAccount = async () => {
    try {
      await api.delete("/users/me", { data: { password } });
      localStorage.clear();
      alert("Your account has been deleted.");
      window.location.href = "/"; // Redirect to homepage/login
    } catch (error) {
      alert("Something went wrong. Please try again.");
      console.error(error);
    }
  };
  const handleDeleteAccount = () => {
    deleteAccount();
  };
  const handleCancel = () => {
    setConfirmDelete(false);
    setPassword("");
  };
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-4xl mx-auto">
          <div className="mb-6">
            <button
              className="flex items-center text-gray-600 hover:text-gray-900"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon size={16} className="mr-1" />
              Back to Settings
            </button>
          </div>
          <h1 className="text-2xl font-bold mb-6">Delete Account</h1>
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center mb-4 text-red-600">
              <AlertCircleIcon className="mr-2" size={24} />
              <h2 className="text-xl font-semibold">
                Warning: This action is irreversible
              </h2>
            </div>
            <p className="mb-4 text-gray-700">
              Deleting your account will permanently remove all your data,
              including:
            </p>
            <ul className="list-disc pl-5 mb-6 text-gray-700">
              <li>All your journal entries</li>
              <li>Your daily challenge progress</li>
              <li>Account settings and preferences</li>
              <li>Any saved templates or drafts</li>
            </ul>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700 font-medium">
                This action cannot be undone. Please be certain.
              </p>
            </div>
            {!confirmDelete ? (
              <form onSubmit={handleSubmit}>
                <div className="mb-6">
                  <label
                    htmlFor="password"
                    className="block mb-2 font-medium text-gray-700"
                  >
                    Verify your identity by entering your password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <LockIcon size={16} className="text-gray-500" />
                    </div>
                    <input
                      type="password"
                      id="password"
                      className={`pl-10 w-full p-2.5 border rounded-lg ${
                        error ? "border-red-500" : "border-gray-300"
                      }`}
                      placeholder="Enter your password"
                      value={password}
                      onChange={handlePasswordChange}
                    />
                  </div>
                  {error && (
                    <p className="mt-2 text-sm text-red-600">{error}</p>
                  )}
                </div>
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-5 py-2.5"
                >
                  Continue
                </button>
              </form>
            ) : (
              <div>
                <h3 className="font-semibold mb-4">
                  Are you absolutely sure you want to delete your account?
                </h3>
                <div className="flex space-x-4">
                  <button
                    onClick={handleDeleteAccount}
                    className="bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-5 py-2.5"
                  >
                    Yes, Delete My Account
                  </button>
                  <button
                    onClick={handleCancel}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg px-5 py-2.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
