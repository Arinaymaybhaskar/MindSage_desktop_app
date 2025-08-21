// src/components/MoodSlider.tsx
import React, { useState, useEffect } from "react";
import { motion, animate } from "framer-motion";

type Props = {
  value: number;
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
  const [visualValue, setVisualValue] = useState(value);
  // --- NEW: State to track if animation is running ---
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Prevent the prop from overriding the value during animation
    if (!isAnimating) {
      setVisualValue(value);
    }
  }, [value, isAnimating]);

  const handleEmojiClick = (newValue: number) => {
    setIsAnimating(true); // <-- Lock the slider from drag input
    animate(visualValue, newValue, {
      duration: 0.4,
      ease: "easeInOut",
      onUpdate: (latest) => {
        setVisualValue(latest);
      },
      onComplete: () => {
        onChange(newValue);
        setIsAnimating(false); // <-- Unlock the slider
      },
    });
  };

  const roundedVisualValue = Math.round(visualValue);
  const selectedMood =
    moods.find((m) => m.value === roundedVisualValue) || moods[2];
  const progress = ((visualValue - 1) / (moods.length - 1)) * 100;

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
        <input
          type="range"
          min="1"
          max="5"
          step="0.01"
          value={visualValue}
          // --- UPDATED: New, optimized onChange handler ---
          onChange={(e) => {
            // Do nothing if an emoji-click animation is running
            if (isAnimating) return;

            const draggedValue = parseFloat(e.target.value);
            // 1. FOR SNAPPING: Always round the value from dragging
            const roundedValue = Math.round(draggedValue);

            // Set the visual state to the rounded value for the snap effect
            setVisualValue(roundedValue);

            // 2. FOR PERFORMANCE: Only notify the parent if the integer changes
            if (value !== roundedValue) {
              onChange(roundedValue);
            }
          }}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer mood-slider"
          style={{
            // @ts-expect-error Custom CSS properties
            "--gradient": gradient,
            "--dark-gradient": darkGradient,
            "--thumb-color": selectedMood.color,
          }}
        />
      </div>

      <div className="flex justify-between mt-3 px-1">
        {moods.map((mood) => (
          <motion.button
            type="button"
            key={mood.value}
            onClick={() => handleEmojiClick(mood.value)}
            className="text-2xl transition-opacity duration-200"
            animate={{
              scale: roundedVisualValue === mood.value ? 1.4 : 1,
              opacity: roundedVisualValue === mood.value ? 1 : 0.5,
            }}
            whileHover={{
              scale: roundedVisualValue === mood.value ? 1.5 : 1.2,
              opacity: 1,
            }}
          >
            {mood.emoji}
          </motion.button>
        ))}
      </div>
    </div>
  );
};
