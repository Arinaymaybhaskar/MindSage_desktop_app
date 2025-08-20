import React from "react";

// Interfaces remain the same
interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  picture: string;
}

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
}

export interface GoogleLoginResult {
  response: { profile: GoogleProfile; tokens: GoogleTokens };
}

interface GoogleLoginElectronProps {
  onSuccess: (result: GoogleLoginResult) => void;
  onError: (error: Error) => void;
}

const GoogleLoginElectron: React.FC<GoogleLoginElectronProps> = ({
  onSuccess,
  onError,
}) => {
  const handleLogin = async () => {
    try {
      const result: GoogleLoginResult =
        await window.electron.ipcRenderer.invoke("login:google");
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error("An unknown error occurred");
      console.error("Google Login Failed:", err);
      if (onError) {
        onError(err);
      }
    }
  };

  return (
    <div className="mt-6">
      {/* --- REVAMP: Added a divider for better UI separation --- */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-light dark:border-border-dark" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-secondary-light dark:bg-secondary-dark px-2 text-text-light-sub dark:text-text-dark-sub">
            OR
          </span>
        </div>
      </div>

      {/* --- CHANGE: Themed Google login button --- */}
      <div className="flex items-center justify-center mt-6">
        <button
          onClick={handleLogin}
          className="font-sans font-medium text-sm text-text-light dark:text-text-dark flex items-center justify-center px-6 py-2.5 rounded-lg
           border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark
           shadow-sm hover:bg-tertiary-light dark:hover:bg-tertiary-dark w-full transition-colors focus:outline-none"
        >
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
            alt="Google logo"
            className="w-5 h-5 mr-3"
          />
          Sign in with Google
        </button>
      </div>
    </div>
  );
};

export default GoogleLoginElectron;
