/**
 * A utility to procedurally generate a full application color theme
 * based on a user's selected primary accent colors.
 */

export interface AccentColors {
  light1: string;
  light2: string;
  light3: string;
  light4: string;
  dark1: string;
  dark2: string;
  dark3: string;
  dark4: string;
}

/**
 * Parses an HSL color string into its component parts.
 * @param hslStr A string in the format "hsl(H, S%, L%)".
 * @returns An object {h, s, l} or null if parsing fails.
 */
const parseHsl = (
  hslStr: string
): { h: number; s: number; l: number } | null => {
  if (!hslStr) return null;
  const regex = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/;
  const match = hslStr.match(regex);
  if (match) {
    return {
      h: parseInt(match[1], 10),
      s: parseFloat(match[2]),
      l: parseFloat(match[3]),
    };
  }
  return null;
};

/**
 * Generates a full application theme from a set of accent colors.
 * It uses the hue and saturation from the primary accent colors (light1, dark1)
 * to create a cohesive set of UI colors (backgrounds, text, borders).
 * @param accents The user's selected accent colors.
 * @returns An object containing all CSS variables for the theme.
 */
export const generateFullTheme = (accents: AccentColors) => {
  const lightSeed = parseHsl(accents.light1);
  const darkSeed = parseHsl(accents.dark1);

  // Fallback to a neutral gray if HSL parsing fails or is not provided
  const lightHue = lightSeed ? lightSeed.h : 0;
  // Cap saturation for backgrounds to keep them subtle and not overpowering
  const lightSat = lightSeed ? Math.min(lightSeed.s, 20) : 0;
  const darkHue = darkSeed ? darkSeed.h : 0;
  const darkSat = darkSeed ? Math.min(darkSeed.s, 15) : 0;

  return {
    // --- Original Accent Colors ---
    "--color-light1": accents.light1,
    "--color-light2": accents.light2,
    "--color-light3": accents.light3,
    "--color-light4": accents.light4,
    "--color-dark1": accents.dark1,
    "--color-dark2": accents.dark2,
    "--color-dark3": accents.dark3,
    "--color-dark4": accents.dark4,

    // --- Generated Light Mode UI Colors ---
    "--color-base-light": `hsl(${lightHue}, ${lightSat}%, 90%)`,
    "--color-secondary-light": `hsl(${lightHue}, ${lightSat}%, 94%)`,
    "--color-tertiary-light": `hsl(${lightHue}, ${lightSat}%, 96%)`,
    "--color-surface-light": `hsl(${lightHue}, ${lightSat}%, 98%)`,
    "--color-text-light": `hsl(${lightHue}, 0%, 10%)`,
    "--color-text-light-sub": `hsl(${lightHue}, 0%, 35%)`,
    "--color-border-light": `hsl(${lightHue}, 0%, 85%)`,

    // --- Generated Dark Mode UI Colors ---
    "--color-base-dark": `hsl(${darkHue}, ${darkSat}%, 5%)`,
    "--color-secondary-dark": `hsl(${darkHue}, ${darkSat}%, 9%)`,
    "--color-tertiary-dark": `hsl(${darkHue}, ${darkSat}%, 15%)`,
    "--color-surface-dark": `hsl(${darkHue}, ${darkSat}%, 10%)`,
    "--color-text-dark": `hsl(${darkHue}, 0%, 95%)`,
    "--color-text-dark-sub": `hsl(${darkHue}, 0%, 65%)`,
    "--color-border-dark": `hsl(${darkHue}, 0%, 25%)`,

    // --- Static Brand/Status Colors ---
    // These remain consistent across themes for semantic meaning.
    "--color-danger": "hsl(0, 50%, 60%)",
    "--color-warning": "hsl(45, 50%, 60%)",
    "--color-success": "hsl(120, 50%, 60%)",
    "--color-info": accents.light1,
  };
};
