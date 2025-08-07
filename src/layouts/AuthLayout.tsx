import { CloudIcon, WifiOffIcon } from "lucide-react";
import { type ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  authMode: string;
  setAuthMode: (authMode: "offline" | "online") => void;
}
export function AuthLayout({
  children,
  title,
  authMode,
  setAuthMode,
}: AuthLayoutProps) {
  const toggleAuthMode = () => {
    setAuthMode(authMode === "offline" ? "online" : "offline");
  };
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row">
      {/* Left side - decorative */}
      <div className="hidden w-1/2 md:flex md:w-1/2 bg-dark2 p-8 flex-col justify-between">
        <img
          src="../../assets/iconLight.png"
          alt="MindSage Logo"
          className="w-12 h-12 p-2 hidden lg:flex md:flex rounded-4xl"
        />
        <div className="text-light2 space-y-6 max-w-md">
          <h1 className="text-3xl font-bold font-fraunces">
            Capture your thoughts, one day at a time
          </h1>
          <p className="text-dark4">
            Your personal space to reflect, grow, and document your journey
            through life.
          </p>
          <div className="flex gap-4">
            <div className="h-1 w-12 bg-light1 rounded-full"></div>
            <div className="h-1 w-12 bg-light2 rounded-full"></div>
            <div className="h-1 w-12 bg-light3 rounded-full"></div>
          </div>
        </div>
        <div className="text-light4 text-sm">
          © {new Date().getFullYear()} MindSage. All rights reserved.
        </div>
      </div>
      {/* Right side - form */}
      <div className="w-full lg:w-1/2 md:w-1/2 min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <div className="flex lg:hidden md:hidden justify-center items-center gap-3">
            <img src="../../assets/iconDark.png" alt="" className="w-8 h-8" />
            <p
              className="text-2xl text-[#314754] font-medium"
            ><span className="font-bold text-[#32344a]">Mind</span>Sage</p>
          </div>
          <div className="mt-6">
            <div className="flex">
              <h2 className=" text-lg font-bold text-gray-600">{title}</h2>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {authMode === "offline"
                ? "Your data stays on this device and is never sent to the cloud"
                : "Your data is securely stored in the cloud and accessible from any device"}
            </p>
          </div>
          <div className="flex justify-center mt-3 mb-4">
            <div className="inline-flex rounded-md shadow-sm mt-2" role="group">
              <button
                type="button"
                onClick={toggleAuthMode}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-medium ${
                  authMode === "offline"
                    ? "bg-blue-50 text-blue-700 border border-blue-300 rounded-l-lg hover:bg-blue-100"
                    : "bg-gray-100 text-gray-500 border border-gray-300 rounded-l-lg hover:bg-gray-200"
                }`}
              >
                <WifiOffIcon size={16} className="mr-2" />
                Offline
              </button>
              <button
                type="button"
                onClick={toggleAuthMode}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-medium ${
                  authMode === "online"
                    ? "bg-purple-50 text-purple-700 border border-purple-300 rounded-r-lg hover:bg-purple-100"
                    : "bg-gray-100 text-gray-500 border border-gray-300 rounded-r-lg hover:bg-gray-200"
                }`}
              >
                <CloudIcon size={16} className="mr-2" />
                Cloud
              </button>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
