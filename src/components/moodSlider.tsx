// src/components/MoodSlider.tsx
import React, { useState, useEffect } from "react";
import { motion, animate } from "framer-motion";
import { MOOD_WORDS } from "../../electron/moodWords";

type Props = {
  /** null/undefined/out of 1-5 means no mood chosen. */
  value: number | null | undefined;
  onChange: (val: number) => void;
};

// The packaged app loads index.html from disk, so a leading-slash path
// would point at the drive root; BASE_URL is "./" in a build.
const face = (n: number) => `${import.meta.env.BASE_URL}emojis/${n}.png`;

const moods = [
  { value: 1, emoji: face(1), label: MOOD_WORDS[0], color: "#ef4444" },
  { value: 2, emoji: face(2), label: MOOD_WORDS[1], color: "#f97316" },
  { value: 3, emoji: face(3), label: MOOD_WORDS[2], color: "#eab308" },
  { value: 4, emoji: face(4), label: MOOD_WORDS[3], color: "#84cc16" },
  { value: 5, emoji: face(5), label: MOOD_WORDS[4], color: "#22c55e" },
];

// Where the thumb rests while no mood is chosen; it is greyed out and labelled.
const REST = 3;
const unset = { label: "Not set", color: "#9ca3af" };

const isMood = (v: number | null | undefined): v is number =>
  typeof v === "number" && v >= 1 && v <= 5;

export const MoodSlider: React.FC<Props> = ({ value: rawValue, onChange }) => {
  const value = isMood(rawValue) ? rawValue : REST;
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

  // Clicking a face animates from REST before the parent holds the value.
  const isSet = isMood(rawValue) || isAnimating;
  const roundedVisualValue = isSet ? Math.round(visualValue) : 0;
  const selectedMood = isSet
    ? moods.find((m) => m.value === roundedVisualValue) || moods[2]
    : unset;
  const progress = isSet ? ((visualValue - 1) / (moods.length - 1)) * 100 : 0;

  const gradient = isSet
    ? `linear-gradient(to right, ${moods[0].color}, ${selectedMood.color} ${progress}%, #e5e7eb ${progress}%)`
    : "#e5e7eb";
  const darkGradient = isSet
    ? `linear-gradient(to right, ${moods[0].color}, ${selectedMood.color} ${progress}%, #4b5563 ${progress}%)`
    : "#4b5563";

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
          data-testid="mood-slider"
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
            if (!isMood(rawValue) || value !== roundedValue) {
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
            className="transition-opacity duration-200"
            animate={{
              scale: roundedVisualValue === mood.value ? 1.4 : 1,
              opacity: roundedVisualValue === mood.value ? 1 : 0.5,
            }}
            whileHover={{
              scale: roundedVisualValue === mood.value ? 1.5 : 1.2,
              opacity: 1,
            }}
          >
            <img src={mood.emoji} alt={mood.label} className="h-8 w-8" />
          </motion.button>
        ))}
      </div>
    </div>
  );
};
