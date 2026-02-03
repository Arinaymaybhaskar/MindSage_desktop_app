import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl"; // Optional size prop
}

const modalSizeClasses = {
  sm: "max-w-md max-h-[40vh]",
  md: "max-w-xl max-h-[60vh]",
  lg: "max-w-3xl max-h-[70vh]",
  xl: "max-w-5xl max-h-[80vh]",
  "2xl": "max-w-7xl max-h-[80vh]",
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md", // Default size
}) => {
  // Effect to handle Escape key press to close the modal
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          // --- CHANGE: Themed overlay with blur and animation ---
          className="fixed inset-0 top-0 bg-base-dark/30 dark:bg-base-dark/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose} // Close modal when clicking the overlay
        >
          <motion.div
            // --- CHANGE: Themed modal content with animation ---
            className={`bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-2xl shadow-xl border border-border-light dark:border-border-dark p-6 sm:p-8 w-full  overflow-auto ${modalSizeClasses[size]}`}
            initial={{ scale: 0.95, y: -20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">{title}</h3>
              {/* --- CHANGE: Themed close button with icon --- */}
              <button
                onClick={onClose}
                className="p-1.5 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark hover:text-danger dark:hover:text-danger transition-colors"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
