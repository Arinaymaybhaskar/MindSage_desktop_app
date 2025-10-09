import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const Dropdown = ({ options, selectedValue, onSelect, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel =
    options.find((opt) => opt.value == selectedValue)?.label || placeholder;

  return (
    <div className="px-4 relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2 gap-2 flex items-center justify-between text-left bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-lg focus:ring-2 focus:ring-info focus:border-info outline-none transition text-sm"
      >
        <span className="truncate text-text-light dark:text-text-dark">
          {selectedLabel}
        </span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronDown
            size={16}
            className="text-text-light-sub dark:text-text-dark-sub"
          />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 5 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full right-0 mt-1 w-full bg-surface-light dark:bg-surface-dark rounded-lg shadow-2xl border border-border-light dark:border-border-dark origin-top-right z-20 p-2 max-h-48 overflow-y-auto"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onSelect(option.value);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-left rounded-md text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
