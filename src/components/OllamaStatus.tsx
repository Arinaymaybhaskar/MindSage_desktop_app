import { Rocket, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

type Status =
  | {
      type:
        | "init"
        | "ollama-not-installed"
        | "downloaded"
        | "system-ready"
        | "pull-failure"
        | "error";
      message?: string;
    }
  | {
      type: "downloading";
      percent: number;
      downloadedMB: number;
      totalMB: number;
    };

export default function OllamaStatus() {
  const [status, setStatus] = useState<Status>({ type: "init" });

  useEffect(() => {
    // This assumes you have an event listener set up in your preload script
    const removeListener = window.electron.onStatusUpdate<Status>(
      (newStatus) => {
        setStatus(newStatus);
      },
    );

    // Request the current status when the component mounts
    window.electron.send("check-status");

    // Cleanup the listener when the component unmounts
    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  const renderStatusIndicator = () => {
    switch (status.type) {
      case "init":
        return (
          <Loader2
            size={16}
            className="animate-spin text-text-light-sub dark:text-text-dark-sub"
          />
        );
      case "downloading": {
        const percent = status.percent || 0;
        return (
          <div className="relative w-full h-2 bg-tertiary-light dark:bg-tertiary-dark rounded-full overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 h-full bg-light1 dark:bg-dark1 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        );
      }
      case "ollama-not-installed":
        return <Rocket size={16} className="text-danger" />;
      case "downloaded":
      case "system-ready":
        return <CheckCircle size={16} className="text-success" />;
      case "pull-failure":
      case "error":
        return <AlertCircle size={16} className="text-danger" />;
      default:
        return null;
    }
  };

  const renderStatusDetails = () => {
    switch (status.type) {
      case "downloading":
        return `Downloading... ${status.percent.toFixed(0)}%`;
      case "ollama-not-installed":
        return "Ollama not found. Click to install.";
      case "downloaded":
        return "Model downloaded successfully!";
      case "system-ready":
        return "Ollama is running and ready.";
      case "pull-failure":
      case "error":
        return "An error occurred with Ollama.";
      default:
        return "Checking AI status...";
    }
  };

  const WrapperComponent =
    status.type === "ollama-not-installed" ? Link : "div";

  return (
    <div className="relative ">
      <WrapperComponent
        to={status.type === "ollama-not-installed" ? "/ollama-tutorial" : "#"}
      >
        <div className="group cursor-pointer">
          <motion.div
            className="flex items-center p-1 rounded-full transition-colors duration-200 "
            whileTap={{ scale: 0.95 }}
          >
            <div className="w-6 h-6 flex items-center justify-center">
              {renderStatusIndicator()}
            </div>
          </motion.div>

          {/* Tooltip */}
          <div className="absolute top-full right-0 mt-2 w-max bg-surface-light dark:bg-surface-dark rounded-lg shadow-lg border border-border-light dark:border-border-dark p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              {renderStatusDetails()}
            </p>
          </div>
        </div>
      </WrapperComponent>
    </div>
  );
}
