import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
// Assuming your mood data utilities are in this path
import { moodHierarchy, moodColors } from "../utils/moodHierarchy";
import type { MoodCore, MoodHierarchy } from "../utils/moodHierarchy";
import { tagService } from "../api/tagService";
import type { CustomFeelingWord } from "../api/tagService";

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
  /** The user's own words, shown under the family they picked (KAN-94). */
  customWords?: CustomFeelingWord[];
  onCustomWordAdded?: (word: CustomFeelingWord) => void;
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
export function MoodTagSelector({
  onChange,
  selected,
  customWords = [],
  onCustomWordAdded,
}: Props) {
  const familyOf = (tag: string): MoodCore | null =>
    findParentMood(tag, moodHierarchy) ??
    customWords.find((w) => w.name === tag)?.family ??
    null;
  const wordsIn = (family: MoodCore) => [
    ...Object.keys(moodHierarchy[family] ?? {}),
    ...customWords.filter((w) => w.family === family).map((w) => w.name),
  ];

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
        const parentMood = familyOf(tag);
        if (parentMood) initialLevel1.add(parentMood);
        // Kept even without a known family (an imported tag, or the user's
        // own word before the list loads), so editing never drops it.
        initialLevel2.push(tag);
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

  // Skip the untouched initial selection: it is built from `selected`, and emitting it
  // would add the parent mood (Happy) of a saved sub-mood the user never picked.
  const initialSelection = useRef(selection);
  useEffect(() => {
    if (selection === initialSelection.current) return;
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
        const childrenOfMood = wordsIn(mood);
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

  const [ownWord, setOwnWord] = useState("");
  const [ownFamily, setOwnFamily] = useState<MoodCore | "">("");
  const [ownError, setOwnError] = useState("");
  const addOwnWord = async () => {
    if (!ownWord.trim() || !ownFamily) return;
    const res = await tagService
      .addCustomWord(ownWord, ownFamily)
      .catch(() => ({ error: "That word could not be saved. Try again." }));
    if ("error" in res) {
      setOwnError(res.error);
      return;
    }
    setOwnError("");
    setOwnWord("");
    // A built-in word or one already listed came back matched: nothing new.
    if (!familyOf(res.name) && res.name !== res.family)
      onCustomWordAdded?.(res);
    setSelection((prev) => ({
      level1: prev.level1.includes(res.family)
        ? prev.level1
        : [...prev.level1, res.family],
      level2:
        res.name === res.family || prev.level2.includes(res.name)
          ? prev.level2
          : [...prev.level2, res.name],
    }));
  };

  const level1Data = moodCores;
  // The user's own words open their family too, also when the list arrived
  // after the selection was built.
  const openFamilies = [
    ...new Set([
      ...selection.level1,
      ...selection.level2.map(familyOf).filter((f) => f !== null),
    ]),
  ] as MoodCore[];

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
        {openFamilies.map((parentMood) => {
          const level2Data = wordsIn(parentMood);

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

      {/* A word of the user's own, in any language, filed under a family. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          data-testid="own-word"
          aria-label="Your own word"
          placeholder="Your own word"
          maxLength={40}
          value={ownWord}
          onChange={(e) => setOwnWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addOwnWord();
            }
          }}
          className="px-2 py-1.5 rounded-lg bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark text-sm"
        />
        <select
          data-testid="own-word-family"
          aria-label="Family for your own word"
          value={ownFamily}
          onChange={(e) => setOwnFamily(e.target.value as MoodCore)}
          className="px-2 py-1.5 rounded-lg bg-secondary-light dark:bg-secondary-dark border border-border-light dark:border-border-dark text-sm"
        >
          <option value="" disabled>
            Pick a family
          </option>
          {moodCores.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="own-word-add"
          onClick={() => void addOwnWord()}
          disabled={!ownWord.trim() || !ownFamily}
          className="px-3 py-1.5 text-xs font-semibold rounded-full border bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark border-border-light dark:border-border-dark disabled:opacity-50"
        >
          Add
        </button>
        {ownError && (
          <p role="alert" className="w-full text-xs text-danger">
            {ownError}
          </p>
        )}
      </div>
    </div>
  );
}
