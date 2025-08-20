import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { moodHierarchy, moodColors } from "../utils/moodHierarchy";

interface Props {
  onChange: (tags: string[]) => void;
  selected: string[];
}

// Utility to get a contrasting text color (black or white) for any background color
const getContrastingTextColor = (hexColor: string) => {
  if (!hexColor) return "text-black";
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "text-black" : "text-white";
};

// Reusable MoodButton sub-component
const MoodButton = ({ mood, onClick, isSelected, color }) => (
  <motion.button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 transform hover:-translate-y-0.5 shadow-sm border
      ${
        isSelected
          ? `${getContrastingTextColor(color)} border-transparent`
          : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-400"
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
      level2: [], // Reset deeper selections when primary mood changes
    }));
  };

  const handleLevel2 = (subMood: string) => {
    setSelection((prev) => {
      const currentLevel2 = prev.level2 || [];
      const newLevel2 = currentLevel2.includes(subMood)
        ? currentLevel2.filter((m) => m !== subMood) // Toggle off
        : [...currentLevel2, subMood]; // Toggle on
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
      {/* Level 1: Core Moods */}
      <AnimatePresence>
        {selection.level1 && (
          <motion.button
            key="clear-button"
            type="button"
            onClick={handleClear}
            className="px-3 underline text-xs flex w-full justify-end items-center text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileTap={{ scale: 0.95 }}
          >
            Clear
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

      {/* Level 2: Secondary Moods (allows multi-select) */}
      <AnimatePresence>
        {selection.level1 && level2Data && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-wrap gap-2 p-3 bg-gray-100 dark:bg-gray-800/50 rounded-lg"
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
