// src/components/EmptyState.tsx
import React from "react";
import { motion } from "framer-motion";

interface EmptyStateProps {
  Icon: React.ElementType;
  title: string;
  message: string;
  action?: React.ReactNode;
}

// NEW: A more visible "breathing" or "pulsing" animation
const iconAnimation = {
  initial: { scale: 1, opacity: 0.8 },
  animate: { scale: 1.05, opacity: 1 },
  transition: {
    duration: 2.5,
    repeat: Infinity,
    repeatType: "mirror", // This makes it smoothly go back and forth
    ease: "easeInOut",
  },
};

const EmptyState: React.FC<EmptyStateProps> = ({
  Icon,
  title,
  message,
  action,
}) => {
  return (
    <div className="text-center bg-secondary-light dark:bg-secondary-dark border-2 border-dashed border-border-light dark:border-border-dark rounded-xl p-12 my-4">
      <motion.div variants={iconAnimation} initial="initial" animate="animate">
        <Icon className="mx-auto h-12 w-12 text-text-light-sub dark:text-text-dark-sub" />
      </motion.div>
      <h3 className="mt-4 text-lg font-semibold text-text-light dark:text-text-dark">
        {title}
      </h3>
      <p className="mt-1 text-sm text-text-light-sub dark:text-text-dark-sub">
        {message}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
};

export default EmptyState;
