import { useState } from "react";
import { moodHierarchy } from "../utils/moodHierarchy";

interface Props {
  onChange: (tags: string[]) => void;
  selected: string[];
}

export function MoodTagSelector({ onChange }: Props) {
  const [level1, setLevel1] = useState<string | null>(null);
  const [level2, setLevel2] = useState<string | null>(null);
  const [level3, setLevel3] = useState<string | null>(null);

  const handleLevel1 = (mood: string) => {
    if (level1 === mood) {
      setLevel1(null);
      setLevel2(null);
      setLevel3(null);
      onChange([]);
    } else {
      setLevel1(mood);
      setLevel2(null);
      setLevel3(null);
      onChange([mood]);
    }
  };

  const handleLevel2 = (subMood: string) => {
    if (level2 === subMood) {
      setLevel2(null);
      setLevel3(null);
      onChange([level1!]);
    } else {
      setLevel2(subMood);
      setLevel3(null);
      onChange([level1!, subMood]);
    }
  };

  const handleLevel3 = (finalTag: string) => {
    if (level3 === finalTag) {
      setLevel3(null);
      onChange([level1!, level2!]);
    } else {
      setLevel3(finalTag);
      onChange([level1!, level2!, finalTag]);
    }
  };

  return (
    <div className="space-y-2 w-full mx-1">
      <label className="font-semibold text-gray-700">Mood Hierarchy</label>
      {/* Level 1: Core */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(moodHierarchy).map((mood) => (
          <button
            type="button"
            key={mood}
            onClick={() => handleLevel1(mood)}
            className={`px-2 py-1 text-xs rounded-full border  transition-all duration-200 transform hover:-translate-y-0.5 ${
              level1 === mood
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {mood}
          </button>
        ))}
      </div>

      {/* Level 2: Secondary */}
      {level1 && (
        <div className="flex flex-wrap gap-2">
          {Object.keys(moodHierarchy[level1 as keyof typeof moodHierarchy]).map(
            (subMood) => (
              <button
                type="button"
                key={subMood}
                onClick={() => handleLevel2(subMood)}
                className={`px-2 py-1 text-xs rounded-full border  transition-all duration-200 transform hover:-translate-y-0.5 ${
                  level2 === subMood
                    ? "bg-indigo-400 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {subMood}
              </button>
            )
          )}
        </div>
      )}

      {/* Level 3: Final Tags */}
      {level1 && level2 && (
        <div className="flex flex-wrap gap-2">
          {moodHierarchy[level1 as keyof typeof moodHierarchy][level2].map(
            (finalTag) => (
              <button
                type="button"
                key={finalTag}
                onClick={() => handleLevel3(finalTag)}
                className={`px-2 py-1 text-xs rounded-full border transition-all duration-200 transform hover:-translate-y-0.5 ${
                  level3 === finalTag
                    ? "bg-indigo-200 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {finalTag}
              </button>
            )
          )}
        </div>
      )}
     
    </div>
  );
}
