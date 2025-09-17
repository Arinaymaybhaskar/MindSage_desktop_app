import { useState, useEffect } from "react";
import { Save, RotateCcw, Palette, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useColorTheme } from "../../hooks/useColorTheme";

interface ColorSettingsProps {
  settings: any;
  onSettingsSave: (settings: any) => void;
}

interface ColorTheme {
  name: string;
  colors: {
    light1: string;
    light2: string;
    light3: string;
    light4: string;
    dark1: string;
    dark2: string;
    dark3: string;
    dark4: string;
  };
}

const PRESET_THEMES: ColorTheme[] = [
  {
    name: "Default",
    colors: {
      light1: "hsl(232, 33%, 75%)",
      light2: "hsl(191, 26%, 82%)",
      light3: "hsl(120, 24%, 87%)",
      light4: "hsl(68, 48%, 90%)",
      dark1: "hsl(235, 17%, 25%)",
      dark2: "hsl(202, 25%, 27%)",
      dark3: "hsl(193, 21%, 40%)",
      dark4: "hsl(136, 17%, 55%)",
    },
  },
  {
    name: "Neutral",
    colors: {
      light1: "hsl(0, 0%, 75%)",
      light2: "hsl(0, 0%, 82%)",
      light3: "hsl(0, 0%, 87%)",
      light4: "hsl(0, 0%, 90%)",
      dark1: "hsl(0, 0%, 25%)",
      dark2: "hsl(0, 0%, 27%)",
      dark3: "hsl(0, 0%, 40%)",
      dark4: "hsl(0, 0%, 55%)",
    },
  },
  {
    name: "Ocean",
    colors: {
      light1: "hsl(200, 50%, 70%)",
      light2: "hsl(180, 40%, 75%)",
      light3: "hsl(160, 30%, 80%)",
      light4: "hsl(140, 25%, 85%)",
      dark1: "hsl(200, 30%, 20%)",
      dark2: "hsl(180, 25%, 25%)",
      dark3: "hsl(160, 20%, 35%)",
      dark4: "hsl(140, 15%, 50%)",
    },
  },
  {
    name: "Sunset",
    colors: {
      light1: "hsl(15, 60%, 75%)",
      light2: "hsl(35, 50%, 80%)",
      light3: "hsl(55, 40%, 85%)",
      light4: "hsl(75, 30%, 90%)",
      dark1: "hsl(15, 40%, 25%)",
      dark2: "hsl(35, 30%, 30%)",
      dark3: "hsl(55, 25%, 40%)",
      dark4: "hsl(75, 20%, 55%)",
    },
  },
  {
    name: "Forest",
    colors: {
      light1: "hsl(120, 40%, 70%)",
      light2: "hsl(100, 35%, 75%)",
      light3: "hsl(80, 30%, 80%)",
      light4: "hsl(60, 25%, 85%)",
      dark1: "hsl(120, 25%, 20%)",
      dark2: "hsl(100, 20%, 25%)",
      dark3: "hsl(80, 15%, 35%)",
      dark4: "hsl(60, 10%, 50%)",
    },
  },
  {
    name: "Purple",
    colors: {
      light1: "hsl(270, 50%, 75%)",
      light2: "hsl(250, 40%, 80%)",
      light3: "hsl(230, 30%, 85%)",
      light4: "hsl(210, 25%, 90%)",
      dark1: "hsl(270, 30%, 25%)",
      dark2: "hsl(250, 25%, 30%)",
      dark3: "hsl(230, 20%, 40%)",
      dark4: "hsl(210, 15%, 55%)",
    },
  },
];

const ColorSettings: React.FC<ColorSettingsProps> = ({
  settings,
  onSettingsSave,
}) => {
  const {
    colorSettings,
    isLoaded,
    saveColorSettings,
    updateColor,
    resetToDefault,
    applyTheme,
    loadFromDatabase,
  } = useColorTheme();
  const [localSettings, setLocalSettings] = useState(colorSettings);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setLocalSettings(colorSettings);
    }
  }, [colorSettings, isLoaded]);

  // Load settings from database when they change
  useEffect(() => {
    if (settings) {
      loadFromDatabase(settings);
      try {
        const dbSettings = {
          customColors: settings.custom_colors
            ? JSON.parse(settings.custom_colors)
            : colorSettings.customColors,
          selectedTheme: settings.selected_theme || colorSettings.selectedTheme,
          useCustomColors:
            settings.use_custom_colors === 1 ||
            settings.use_custom_colors === true,
        };
        setLocalSettings(dbSettings);
      } catch (error) {
        console.error("Failed to parse color settings from database:", error);
        setLocalSettings(colorSettings);
      }
    }
  }, [settings]);

  useEffect(() => {
    // Check if dark mode is enabled
    const isDark = document.documentElement.classList.contains("dark");
    setIsDarkMode(isDark);
  }, []);

  const handleColorChange = (colorKey: string, value: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      customColors: {
        ...prev.customColors,
        [colorKey]: value,
      },
    }));
  };

  const handleThemeSelect = (theme: ColorTheme) => {
    setLocalSettings((prev) => ({
      ...prev,
      selectedTheme: theme.name,
      customColors: theme.colors,
      useCustomColors: false,
    }));
  };

  const handleSave = () => {
    saveColorSettings(localSettings);
    // Convert camelCase to snake_case for database compatibility
    const dbSettings = {
      custom_colors: JSON.stringify(localSettings.customColors),
      selected_theme: localSettings.selectedTheme,
      use_custom_colors: localSettings.useCustomColors ? 1 : 0,
    };
    onSettingsSave({ ...settings, ...dbSettings });
  };

  const handleReset = () => {
    resetToDefault();
    const defaultTheme = PRESET_THEMES[0];
    setLocalSettings({
      customColors: defaultTheme.colors,
      selectedTheme: defaultTheme.name,
      useCustomColors: false,
    });
  };

  const ColorPicker = ({
    label,
    colorKey,
    value,
  }: {
    label: string;
    colorKey: string;
    value: string;
  }) => (
    <div className="flex items-center justify-between p-3 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-border-light dark:border-border-dark"
          style={{ backgroundColor: value }}
        />
        <span className="font-medium text-text-light dark:text-text-dark">
          {label}
        </span>
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => handleColorChange(colorKey, e.target.value)}
        className="w-12 h-8 rounded border border-border-light dark:border-border-dark cursor-pointer"
      />
    </div>
  );

  const ThemePreview = ({ theme }: { theme: ColorTheme }) => (
    <motion.button
      onClick={() => handleThemeSelect(theme)}
      className={`p-4 rounded-xl border-2 transition-all ${
        localSettings.selectedTheme === theme.name
          ? "border-info bg-info/10"
          : "border-border-light dark:border-border-dark hover:border-info/50"
      }`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Palette size={16} className="text-text-light dark:text-text-dark" />
        <span className="font-medium text-text-light dark:text-text-dark">
          {theme.name}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {Object.entries(theme.colors).map(([key, color]) => (
          <div
            key={key}
            className="w-6 h-6 rounded"
            style={{ backgroundColor: color }}
            title={`${key}: ${color}`}
          />
        ))}
      </div>
    </motion.button>
  );

  if (!isLoaded) {
    return (
      <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-tertiary-light dark:bg-tertiary-dark rounded mb-2"></div>
            <div className="h-4 bg-tertiary-light dark:bg-tertiary-dark rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark flex items-center gap-2">
          <Palette size={20} />
          Color Theme
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Customize the app's color scheme to match your preferences.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Preset Themes */}
        <div>
          <h3 className="text-lg font-semibold text-text-light dark:text-text-dark mb-4">
            Preset Themes
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRESET_THEMES.map((theme) => (
              <ThemePreview key={theme.name} theme={theme} />
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text-light dark:text-text-dark">
              Custom Colors
            </h3>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-1 text-sm text-text-light-sub dark:text-text-dark-sub hover:text-text-light dark:hover:text-text-dark transition-colors"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <Sun size={16} className="text-text-light dark:text-text-dark" />
              <span className="font-medium text-text-light dark:text-text-dark">
                Light Mode Colors
              </span>
            </div>
            <ColorPicker
              label="Primary Accent"
              colorKey="light1"
              value={localSettings.customColors.light1}
            />
            <ColorPicker
              label="Secondary Accent"
              colorKey="light2"
              value={localSettings.customColors.light2}
            />
            <ColorPicker
              label="Tertiary Accent"
              colorKey="light3"
              value={localSettings.customColors.light3}
            />
            <ColorPicker
              label="Quaternary Accent"
              colorKey="light4"
              value={localSettings.customColors.light4}
            />

            <div className="flex items-center gap-2 mb-4 mt-6">
              <Moon size={16} className="text-text-light dark:text-text-dark" />
              <span className="font-medium text-text-light dark:text-text-dark">
                Dark Mode Colors
              </span>
            </div>
            <ColorPicker
              label="Primary Accent"
              colorKey="dark1"
              value={localSettings.customColors.dark1}
            />
            <ColorPicker
              label="Secondary Accent"
              colorKey="dark2"
              value={localSettings.customColors.dark2}
            />
            <ColorPicker
              label="Tertiary Accent"
              colorKey="dark3"
              value={localSettings.customColors.dark3}
            />
            <ColorPicker
              label="Quaternary Accent"
              colorKey="dark4"
              value={localSettings.customColors.dark4}
            />
          </div>
        </div>

        {/* Live Preview */}
        <div>
          <h3 className="text-lg font-semibold text-text-light dark:text-text-dark mb-4">
            Live Preview
          </h3>
          <div className="p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(localSettings.customColors).map(
                ([key, color]) => (
                  <div key={key} className="text-center">
                    <div
                      className="w-full h-12 rounded-lg mb-2 border border-border-light dark:border-border-dark"
                      style={{ backgroundColor: color }}
                    />
                    <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                      {key}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t border-border-light dark:border-border-dark pt-6">
          <motion.button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-3 bg-info text-white font-semibold rounded-lg shadow-md hover:bg-info/90 transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Save size={16} />
            Save Colors
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default ColorSettings;
