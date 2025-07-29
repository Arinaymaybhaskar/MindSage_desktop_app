// src/components/MoodSlider.tsx
import React from "react";

type Props = {
  value: number;
  onChange: (val: number) => void;
};

const moods = [
  {
    value: 1,
    emoji: "😞",
    label: "Bad",
  },
  {
    value: 2,
    emoji: "😐",
    label: "Neutral",
  },
  {
    value: 3,
    emoji: "🙂",
    label: "Good",
  },
  {
    value: 4,
    emoji: "😊",
    label: "Great",
  },
  {
    value: 5,
    emoji: "😄",
    label: "Excellent",
  },
];

export const MoodSlider: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="mb-4 w-full mx-1">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Mood Tracking</h3>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          How are you feeling?
        </label>
        <div className="flex flex-col space-y-2">
          <div className="flex items-center">
            <div className="flex items-center flex-col w-full">

            <input
              type="range"
              min="1"
              max="5"
              value={value}
              onChange={(e) => onChange(parseInt(e.target.value))}
              className="w-full mr-2 accent-indigo-600 h-2 rounded-lg  cursor-pointer"
              />
            <div className="text-xs text-gray-500 flex justify-between px-1 w-full mt-2">
              <span>Bad</span>
              <span>{moods[value - 1]?.label}</span>
              <span>Excellent</span>
            </div>
              </div>
            <div className="flex space-x-1 items-baseline justify-center ">
              {moods.map((mood) => (
                <button
                  type="button"
                  key={mood.value}
                  onClick={() => onChange(mood.value)}
                  className={`text-xl transition-all duration-300 hover:scale-110 ${
                    value === mood.value
                      ? "scale-125 transform-gpu"
                      : "opacity-50"
                  }`}
                >
                  {mood.emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
