import { ChevronDown, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarPanelProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}

export const SidebarPanel = ({
  title,
  icon: Icon,
  children,
}: SidebarPanelProps) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
      <button
        type="button"
        className="w-full flex justify-between items-center p-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-info" />
          <h3 className="font-semibold text-text-light dark:text-text-dark">
            {title}
          </h3>
        </div>
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }}>
          <ChevronDown
            size={20}
            className="text-text-light-sub dark:text-text-dark-sub transition-transform"
          />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="p-4 border-t border-border-light dark:border-border-dark">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
