import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
// Assuming your mood data utilities are in this path
import { moodHierarchy, moodColors } from "../utils/moodHierarchy";
import type { MoodCore, MoodHierarchy } from "../utils/moodHierarchy";

/** The seven top-level moods, as a typed list rather than bare strings. */
const moodCores = Object.keys(moodHierarchy) as MoodCore[];

// --- HELPER FUNCTIONS ---
const getContrastingTextColor = (hexColor: string) => {
  if (!hexColor) return "text-text-light dark:text-text-dark";
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "text-black" : "text-white";
};

const findParentMood = (
  childMood: string,
  hierarchy: MoodHierarchy,
): MoodCore | null => {
  for (const parentMood of Object.keys(hierarchy) as MoodCore[]) {
    const children = hierarchy[parentMood];
    if (children && typeof children === "object" && childMood in children) {
      return parentMood;
    }
  }
  return null;
};

// --- PROPS INTERFACE ---
interface Props {
  onChange: (tags: string[]) => void;
  selected: string[];
}

// --- SUB-COMPONENTS ---
interface MoodButtonProps {
  mood: string;
  onClick: () => void;
  isSelected: boolean;
  color: string;
}

const MoodButton = ({ mood, onClick, isSelected, color }: MoodButtonProps) => (
  <button
    type="button"
    data-testid={`mood-tag-${mood}`}
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors duration-200 shadow-sm border
      ${
        isSelected
          ? `${getContrastingTextColor(color)} border-transparent`
          : "bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark border-border-light dark:border-border-dark hover:border-border-light/70 dark:hover:border-border-dark/70"
      }`}
    style={{ backgroundColor: isSelected ? color : undefined }}
  >
    {mood}
  </button>
);

// --- MAIN COMPONENT ---
export function MoodTagSelector({ onChange, selected }: Props) {
  const getInitialState = () => {
    if (!selected || selected.length === 0) {
      return { level1: [], level2: [] };
    }
    const initialLevel1 = new Set<string>();
    const initialLevel2: string[] = [];
    const allLevel1Keys: string[] = moodCores;
    selected.forEach((tag) => {
      if (allLevel1Keys.includes(tag)) {
        initialLevel1.add(tag);
      } else {
        const parentMood = findParentMood(tag, moodHierarchy);
        if (parentMood) {
          initialLevel1.add(parentMood);
          initialLevel2.push(tag);
        }
      }
    });
    return {
      level1: Array.from(initialLevel1),
      level2: initialLevel2,
    };
  };

  const [selection, setSelection] = useState(getInitialState);

  // Callers pass an inline arrow, so depending on `onChange` directly would
  // re-run this on every parent render and loop through setEntry.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const uniqueTags = new Set([...selection.level1, ...selection.level2]);
    onChangeRef.current(Array.from(uniqueTags));
  }, [selection]);

  const handleLevel1 = (mood: MoodCore) => {
    setSelection((prev) => {
      const newLevel1 = prev.level1.includes(mood)
        ? prev.level1.filter((m) => m !== mood)
        : [...prev.level1, mood];
      let newLevel2 = prev.level2;
      if (!newLevel1.includes(mood)) {
        const childrenOfMood = moodHierarchy[mood]
          ? Object.keys(moodHierarchy[mood])
          : [];
        newLevel2 = newLevel2.filter((m) => !childrenOfMood.includes(m));
      }
      return { level1: newLevel1, level2: newLevel2 };
    });
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
      level1: [],
      level2: [],
    });
  };

  const level1Data = moodCores;

  return (
    <div className="space-y-4 w-full">
      {selection.level1.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          className="text-xs flex w-full justify-end items-center gap-1 text-text-light-sub dark:text-text-dark-sub hover:text-danger dark:hover:text-danger transition-colors"
        >
          <X size={12} /> Clear
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {level1Data.map((mood) => (
          <MoodButton
            key={mood}
            mood={mood}
            onClick={() => handleLevel1(mood)}
            isSelected={selection.level1.includes(mood)}
            color={moodColors[mood]}
          />
        ))}
      </div>

      <div className="space-y-3">
        {selection.level1.map((parentMood) => {
          const level2Data = Object.keys(
            moodHierarchy[parentMood as MoodCore] || {},
          );

          if (level2Data.length === 0) return null;

          return (
            <div
              key={parentMood}
              className="flex flex-wrap gap-2 p-3 bg-secondary-light dark:bg-secondary-dark rounded-lg border border-border-light dark:border-border-dark"
            >
              {level2Data.map((subMood) => (
                <MoodButton
                  key={subMood}
                  mood={subMood}
                  onClick={() => handleLevel2(subMood)}
                  isSelected={selection.level2.includes(subMood)}
                  color={moodColors[parentMood as MoodCore]}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
