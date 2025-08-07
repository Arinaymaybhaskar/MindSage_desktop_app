import React from "react";

// Define the structure of the data returned from the main process
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

// Define the types for the component's props
interface GoogleLoginElectronProps {
  onSuccess: any;
  onError: any;
}

const GoogleLoginElectron: React.FC<GoogleLoginElectronProps> = ({
  onSuccess,
  onError,
}) => {
  const handleLogin = async () => {
    try {
      // This 'login:google' channel must be exposed in your preload script
      const result: GoogleLoginResult =
        await window.electron.ipcRenderer.invoke("login:google");
      if (onSuccess) {
        // You can now pass the user profile and tokens to your app's state
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
    <div className="flex items-center justify-center mt-4">
      <button
        onClick={handleLogin}
        className="font-sans font-medium text-sm text-gray-800 flex items-center justify-center rounded-full
          shadow-sm hover:bg-gray-200 gap-3 w-[200px] h-[40px]  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
      >
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
          alt="Google logo"
          className="mr-[10px] w-5 h-5"
        />
        Sign in with Google
      </button>
    </div>
  );
};

export default GoogleLoginElectron;
