import React from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";

const QuickCaptureTitleBar: React.FC = () => {
  const handleClose = async () => {
    await window.electron.ipcRenderer.invoke("quick-capture:close");
  };

  const iconDark = new URL("../../assets/iconDark.png", import.meta.url).href;
  const iconLight = new URL("../../assets/iconLight.png", import.meta.url).href;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex items-center justify-between h-8 bg-transparent" // Minimal height, transparent background
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center h-full px-3">
        <img
          src={iconDark}
          className="w-4 h-4 dark:hidden"
          alt="MindSage Logo"
        />
        <img
          src={iconLight}
          className="w-4 h-4 hidden dark:block"
          alt="MindSage Logo"
        />
      </div>
      <button
        onClick={handleClose}
        className="h-full w-8 flex justify-center items-center text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark rounded-tr-md transition-colors flex-shrink-0" // Rounded top-right corner
        aria-label="Close"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <X size={16} />
      </button>
    </motion.div>
  );
};

export default QuickCaptureTitleBar;
