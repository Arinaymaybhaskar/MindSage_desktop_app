import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export interface PdfLightboxProps {
  name?: string;
  path: string;
  dataUrl: string | null;
  onClose: () => void;
}

export const PdfLightbox: React.FC<PdfLightboxProps> = ({
  name,
  path,
  dataUrl,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {path && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div
            className="relative w-[90vw] h-[80vh] bg-white dark:bg-surface-dark rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {dataUrl ? (
              <iframe
                src={dataUrl}
                title={name || "PDF"}
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-light-sub dark:text-text-dark-sub">
                Loading PDF…
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PdfLightbox;
