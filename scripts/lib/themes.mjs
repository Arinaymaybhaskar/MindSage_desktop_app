/**
 * Accent presets, generated verbatim from src/components/settings/ColorSettings.tsx.
 *
 * Kept in sync by regenerating rather than by hand: the ramps are not intuitive
 * (Purple runs 270 -> 210, toward blue, not toward magenta), so retyping them
 * from memory produces colours that look plausible and are wrong.
 */
export const PRESETS = {
  Default: {
    light1: "hsl(232, 33%, 75%)",
    light2: "hsl(191, 26%, 82%)",
    light3: "hsl(120, 24%, 87%)",
    light4: "hsl(68, 48%, 90%)",
    dark1: "hsl(235, 17%, 25%)",
    dark2: "hsl(202, 25%, 27%)",
    dark3: "hsl(193, 21%, 40%)",
    dark4: "hsl(136, 17%, 55%)",
  },
  Neutral: {
    light1: "hsl(0, 0%, 75%)",
    light2: "hsl(0, 0%, 82%)",
    light3: "hsl(0, 0%, 87%)",
    light4: "hsl(0, 0%, 90%)",
    dark1: "hsl(0, 0%, 25%)",
    dark2: "hsl(0, 0%, 27%)",
    dark3: "hsl(0, 0%, 40%)",
    dark4: "hsl(0, 0%, 55%)",
  },
  Ocean: {
    light1: "hsl(200, 50%, 70%)",
    light2: "hsl(180, 40%, 75%)",
    light3: "hsl(160, 30%, 80%)",
    light4: "hsl(140, 25%, 85%)",
    dark1: "hsl(200, 30%, 20%)",
    dark2: "hsl(180, 25%, 25%)",
    dark3: "hsl(160, 20%, 35%)",
    dark4: "hsl(140, 15%, 50%)",
  },
  Sunset: {
    light1: "hsl(15, 60%, 75%)",
    light2: "hsl(35, 50%, 80%)",
    light3: "hsl(55, 40%, 85%)",
    light4: "hsl(75, 30%, 90%)",
    dark1: "hsl(15, 40%, 25%)",
    dark2: "hsl(35, 30%, 30%)",
    dark3: "hsl(55, 25%, 40%)",
    dark4: "hsl(75, 20%, 55%)",
  },
  Forest: {
    light1: "hsl(120, 40%, 70%)",
    light2: "hsl(100, 35%, 75%)",
    light3: "hsl(80, 30%, 80%)",
    light4: "hsl(60, 25%, 85%)",
    dark1: "hsl(120, 25%, 20%)",
    dark2: "hsl(100, 20%, 25%)",
    dark3: "hsl(80, 15%, 35%)",
    dark4: "hsl(60, 10%, 50%)",
  },
  Purple: {
    light1: "hsl(270, 50%, 75%)",
    light2: "hsl(250, 40%, 80%)",
    light3: "hsl(230, 30%, 85%)",
    light4: "hsl(210, 25%, 90%)",
    dark1: "hsl(270, 30%, 25%)",
    dark2: "hsl(250, 25%, 30%)",
    dark3: "hsl(230, 20%, 40%)",
    dark4: "hsl(210, 15%, 55%)",
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
