import { useState, useEffect } from "react";
import { generateFullTheme, type AccentColors } from "../utils/colorGenerator";
import type { UserSettings } from "../types/User";

/** The eight user-selectable accents that seed the generated palette. */
export type ColorTheme = AccentColors;

export interface ColorSettings {
  customColors: ColorTheme;
  selectedTheme: string;
  useCustomColors: boolean;
}

const DEFAULT_COLORS: ColorTheme = {
  light1: "hsl(232, 33%, 75%)",
  light2: "hsl(191, 26%, 82%)",
  light3: "hsl(120, 24%, 87%)",
  light4: "hsl(68, 48%, 90%)",
  dark1: "hsl(235, 17%, 25%)",
  dark2: "hsl(202, 25%, 27%)",
  dark3: "hsl(193, 21%, 40%)",
  dark4: "hsl(136, 17%, 55%)",
};

export const useColorTheme = () => {
  const [colorSettings, setColorSettings] = useState<ColorSettings>({
    customColors: DEFAULT_COLORS,
    selectedTheme: "Default",
    useCustomColors: false,
  });

  const [isLoaded, setIsLoaded] = useState(false);

  // Apply colors to CSS variables
  const applyColorsToDocument = (colors: ColorTheme) => {
    // Generate the full palette from the base accent colors
    const fullTheme = generateFullTheme(colors);
    const root = document.documentElement;

    // Apply every generated color variable to the document root
    Object.entries(fullTheme).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  };

  // Load color settings from localStorage on initial mount
  useEffect(() => {
    const loadColorSettings = () => {
      try {
        const saved = localStorage.getItem("colorTheme");
        if (saved) {
          const parsed = JSON.parse(saved);
          setColorSettings(parsed);
          applyColorsToDocument(parsed.customColors);
        } else {
          // Apply default colors if nothing is saved
          applyColorsToDocument(DEFAULT_COLORS);
        }
      } catch (error) {
        console.error("Failed to load color settings:", error);
        applyColorsToDocument(DEFAULT_COLORS);
      } finally {
        setIsLoaded(true);
      }
    };

    loadColorSettings();
  }, []);

  // Function to load settings from database format
  const loadFromDatabase = (dbSettings: Partial<UserSettings> | null) => {
    if (dbSettings) {
      try {
        const parsed = {
          customColors: dbSettings.custom_colors
            ? JSON.parse(dbSettings.custom_colors)
            : DEFAULT_COLORS,
          selectedTheme: dbSettings.selected_theme || "Default",
          useCustomColors:
            dbSettings.use_custom_colors === 1 ||
            dbSettings.use_custom_colors === true,
        };
        setColorSettings(parsed);
        applyColorsToDocument(parsed.customColors);
        // Also save to localStorage for offline access and faster reloads
        localStorage.setItem("colorTheme", JSON.stringify(parsed));
      } catch (error) {
        console.error("Failed to load color settings from database:", error);
      }
    }
  };

  // Save color settings to localStorage
  const saveColorSettings = (newSettings: ColorSettings) => {
    try {
      localStorage.setItem("colorTheme", JSON.stringify(newSettings));
      setColorSettings(newSettings);
      applyColorsToDocument(newSettings.customColors);
    } catch (error) {
      console.error("Failed to save color settings:", error);
    }
  };

  // Update a specific color
  const updateColor = (colorKey: keyof ColorTheme, value: string) => {
    const newColors = {
      ...colorSettings.customColors,
      [colorKey]: value,
    };

    const newSettings = {
      ...colorSettings,
      customColors: newColors,
    };

    saveColorSettings(newSettings);
  };

  // Reset to default colors
  const resetToDefault = () => {
    const defaultSettings = {
      customColors: DEFAULT_COLORS,
      selectedTheme: "Default",
      useCustomColors: false,
    };
    saveColorSettings(defaultSettings);
  };

  // Apply a preset theme
  const applyTheme = (themeName: string, themeColors: ColorTheme) => {
    const newSettings = {
      customColors: themeColors,
      selectedTheme: themeName,
      useCustomColors: false,
    };
    saveColorSettings(newSettings);
  };

  return {
    colorSettings,
    isLoaded,
    saveColorSettings,
    updateColor,
    resetToDefault,
    applyTheme,
    loadFromDatabase,
  };
};
