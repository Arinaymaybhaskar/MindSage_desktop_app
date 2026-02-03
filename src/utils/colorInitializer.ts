import { generateFullTheme } from "./colorGenerator";

// Default colors used ONLY if localStorage is empty or corrupted.
const DEFAULT_ACCENT_COLORS = {
  light1: "hsl(232, 33%, 75%)",
  light2: "hsl(191, 26%, 82%)",
  light3: "hsl(120, 24%, 87%)",
  light4: "hsl(68, 48%, 90%)",
  dark1: "hsl(235, 17%, 25%)",
  dark2: "hsl(202, 25%, 27%)",
  dark3: "hsl(193, 21%, 40%)",
  dark4: "hsl(136, 17%, 55%)",
};

/**
 * Applies a full theme to the document's root element.
 * @param colors The accent colors to generate the theme from.
 */
const applyThemeToDocument = (colors: any) => {
  const fullTheme = generateFullTheme(colors);
  const root = document.documentElement;
  Object.entries(fullTheme).forEach(([key, value]) => {
    root.style.setProperty(key, String(value));
  });
};

/**
 * Initializes the application's color theme on startup.
 * It reads from localStorage and applies the full generated theme
 * to prevent a flash of unstyled content.
 */
export const initializeColors = () => {
  try {
    const saved = localStorage.getItem("colorTheme");
    if (saved) {
      const colorSettings = JSON.parse(saved);
      // Generate and apply the full theme from saved accent colors
      applyThemeToDocument(colorSettings.customColors);
    } else {
      // Generate and apply the full theme from default accent colors
      applyThemeToDocument(DEFAULT_ACCENT_COLORS);
    }
  } catch (error) {
    console.error("Failed to initialize colors:", error);
    // Fallback to defaults in case of any error
    applyThemeToDocument(DEFAULT_ACCENT_COLORS);
  }
};
