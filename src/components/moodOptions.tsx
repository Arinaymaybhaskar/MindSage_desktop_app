import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { moodHierarchy, moodColors } from "../utils/moodHierarchy";
import { X } from "lucide-react"; // Using an icon for the clear button

interface Props {
  onChange: (tags: string[]) => void;
  selected: string[];
}

const getContrastingTextColor = (hexColor: string) => {
  if (!hexColor) return "text-text-light dark:text-text-dark";
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "text-black" : "text-white";
};

// --- CHANGE: Themed MoodButton sub-component ---
const MoodButton = ({ mood, onClick, isSelected, color }) => (
  <motion.button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 transform hover:-translate-y-0.5 shadow-sm border
      ${
        isSelected
          ? `${getContrastingTextColor(color)} border-transparent`
          : "bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark border-border-light dark:border-border-dark hover:border-border-light/70 dark:hover:border-border-dark/70"
      }`}
    style={{ backgroundColor: isSelected ? color : undefined }}
    whileTap={{ scale: 0.95 }}
  >
    {mood}
  </motion.button>
);

export function MoodTagSelector({ onChange, selected }: Props) {
  const [selection, setSelection] = useState({
    level1: selected[0] || null,
    level2: selected.slice(1),
  });

  useEffect(() => {
    const newTags = [selection.level1, ...selection.level2].filter(
      Boolean
    ) as string[];
    onChange(newTags);
  }, [selection]);

  const handleLevel1 = (mood: string) => {
    setSelection((prev) => ({
      level1: prev.level1 === mood ? null : mood,
      level2: [],
    }));
  };

  const handleLevel2 = (subMood: string) => {
    setSelection((prev) => {
      const currentLevel2 = prev.level2 || [];
      const newLevel2 = currentLevel2.includes(subMood)
        ? currentLevel2.filter((m) => m !== subMood)
        : [...currentLevel2, subMood];
      return { ...prev, level2: newLevel2 };
    });
  };

  const handleClear = () => {
    setSelection({
      level1: null,
      level2: [],
    });
  };

  const level1Data = Object.keys(moodHierarchy);
  const level2Data = selection.level1
    ? Object.keys(moodHierarchy[selection.level1])
    : null;

  return (
    <div className="space-y-4 w-full">
      <AnimatePresence>
        {selection.level1 && (
          // --- CHANGE: Themed clear button ---
          <motion.button
            key="clear-button"
            type="button"
            onClick={handleClear}
            className="text-xs flex w-full justify-end items-center gap-1 text-text-light-sub dark:text-text-dark-sub hover:text-danger dark:hover:text-danger transition-colors"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            whileTap={{ scale: 0.95 }}
          >
            <X size={12} /> Clear
          </motion.button>
        )}
      </AnimatePresence>
      <div className="flex flex-wrap items-center gap-2">
        {level1Data.map((mood) => (
          <MoodButton
            key={mood}
            mood={mood}
            onClick={() => handleLevel1(mood)}
            isSelected={selection.level1 === mood}
            color={moodColors[mood]}
          />
        ))}
      </div>

      <AnimatePresence>
        {selection.level1 && level2Data && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            // --- CHANGE: Themed sub-mood container ---
            className="flex flex-wrap gap-2 p-3 bg-secondary-light dark:bg-secondary-dark rounded-lg border border-border-light dark:border-border-dark"
          >
            {level2Data.map((subMood) => (
              <MoodButton
                key={subMood}
                mood={subMood}
                onClick={() => handleLevel2(subMood)}
                isSelected={selection.level2.includes(subMood)}
                color={moodColors[selection.level1!]}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
