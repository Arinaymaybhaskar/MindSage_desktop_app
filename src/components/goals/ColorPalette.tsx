import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

const COLOR_PALETTE = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#EAB308",
  "#84CC16",
  "#22C55E",
  "#10B981",
  "#14B8A6",
  "#06B6D4",
  "#0EA5E9",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#A855F7",
  "#D946EF",
  "#EC4899",
];

interface ColorPaletteProps {
  onColorSelect: (color: string) => void;
  // Changed to selectedColor to reflect that it's a controlled component
  selectedColor: string;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({
  onColorSelect,
  selectedColor,
}) => {
  return (
    <div className="mt-2 grid grid-cols-8 gap-2">
      {COLOR_PALETTE.map((color) => {
        const isSelected = selectedColor === color;

        return (
          <motion.button
            type="button"
            key={color}
            onClick={() => onColorSelect(color)}
            className={`relative flex items-center justify-center h-8 w-8 rounded-full cursor-pointer transition-all duration-200 ease-in-out
                            ${
                              isSelected
                                ? "ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-gray-800"
                                : "ring-1 ring-inset ring-black/10"
                            }`}
            style={{ backgroundColor: color }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.95 }}
            aria-label={`Select color ${color}`}
          >
            <AnimatePresence>
              {isSelected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                >
                  <Check className="text-white" size={18} strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
};

export default ColorPalette;
