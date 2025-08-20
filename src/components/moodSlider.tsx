// src/components/MoodSlider.tsx
import React from "react";
import { motion } from "framer-motion";

type Props = {
  value: number; // The mood score, expected to be 1-5
  onChange: (val: number) => void;
};

const moods = [
  { value: 1, emoji: "😞", label: "Bad", color: "#ef4444" },
  { value: 2, emoji: "😐", label: "Neutral", color: "#f97316" },
  { value: 3, emoji: "🙂", label: "Good", color: "#eab308" },
  { value: 4, emoji: "😊", label: "Great", color: "#84cc16" },
  { value: 5, emoji: "😄", label: "Excellent", color: "#22c55e" },
];

export const MoodSlider: React.FC<Props> = ({ value, onChange }) => {
  const selectedMood = moods.find((m) => m.value === value) || moods[2];
  const progress = ((value - 1) / (moods.length - 1)) * 100;

  // Create a color gradient for the slider track
  const gradient = `linear-gradient(to right, ${moods[0].color}, ${selectedMood.color} ${progress}%, #e5e7eb ${progress}%)`;
  const darkGradient = `linear-gradient(to right, ${moods[0].color}, ${selectedMood.color} ${progress}%, #4b5563 ${progress}%)`;

  return (
    <div className="w-full mb-5">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          How are you feeling?
        </label>
        <span className="text-sm " style={{ color: selectedMood.color }}>
          {selectedMood.label}
        </span>
      </div>

      <div className="relative w-full">
        {/* Themed Range Slider */}
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer mood-slider"
          style={{
            // @ts-expect-error
            "--gradient": gradient,
            "--dark-gradient": darkGradient,
            "--thumb-color": selectedMood.color,
          }}
        />
      </div>

      {/* Clickable Emoji Labels */}
      <div className="flex justify-between mt-3 px-1">
        {moods.map((mood) => (
          <motion.button
            type="button"
            key={mood.value}
            onClick={() => onChange(value)}
            className="text-2xl transition-opacity duration-200"
            animate={{
              scale: value === mood.value ? 1.4 : 1,
              opacity: value === mood.value ? 1 : 0.5,
            }}
            whileHover={{ scale: value === mood.value ? 1.5 : 1.2, opacity: 1 }}
          >
            {mood.emoji}
          </motion.button>
        ))}
      </div>
    </div>
  );
};
