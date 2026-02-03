import React from "react";
import { motion } from "framer-motion";

export const LoadingBubble: React.FC<{ message: string }> = ({ message }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="flex justify-start"
  >
    <div className="bg-surface-light dark:bg-surface-dark text-text-light-sub dark:text-text-dark-sub px-4 py-3 rounded-2xl rounded-bl-lg shadow-sm border border-border-light dark:border-border-dark">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 bg-text-light-sub/50 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
          <span className="h-2 w-2 bg-text-light-sub/50 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
          <span className="h-2 w-2 bg-text-light-sub/50 rounded-full animate-pulse"></span>
        </div>
        <span className="text-sm italic">{message}</span>
      </div>
    </div>
  </motion.div>
);

export default LoadingBubble;


