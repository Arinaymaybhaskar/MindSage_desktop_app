import { useState, useEffect, useRef } from "react";
import { Save, RotateCcw, Palette } from "lucide-react";
import { motion } from "framer-motion";
import { useColorTheme } from "../../hooks/useColorTheme";
import type { SettingsPanelProps } from "../../types/User";

type ColorSettingsProps = Pick<
  SettingsPanelProps,
  "settings" | "onSettingsSave"
>;

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
    resetToDefault,
    loadFromDatabase,
  } = useColorTheme();
  const [localSettings, setLocalSettings] = useState(colorSettings);

  // Read through refs so seeding from the database row stays keyed on
  // `settings` alone and cannot re-trigger itself via the colours it sets.
  const colorSettingsRef = useRef(colorSettings);
  const loadFromDatabaseRef = useRef(loadFromDatabase);
  useEffect(() => {
    colorSettingsRef.current = colorSettings;
    loadFromDatabaseRef.current = loadFromDatabase;
  });

  useEffect(() => {
    if (isLoaded) {
      setLocalSettings(colorSettings);
    }
  }, [colorSettings, isLoaded]);

  // Load settings from database when they change
  useEffect(() => {
    if (settings) {
      loadFromDatabaseRef.current(settings);
      try {
        const dbSettings = {
          customColors: settings.custom_colors
            ? JSON.parse(settings.custom_colors)
            : colorSettingsRef.current.customColors,
          selectedTheme:
            settings.selected_theme || colorSettingsRef.current.selectedTheme,
          useCustomColors:
            settings.use_custom_colors === 1 ||
            settings.use_custom_colors === true,
        };
        setLocalSettings(dbSettings);
      } catch (error) {
        console.error("Failed to parse color settings from database:", error);
        setLocalSettings(colorSettingsRef.current);
      }
    }
  }, [settings]);

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
    if (settings) onSettingsSave({ ...settings, ...dbSettings });
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
        className="w-12 h-8 cursor-pointer"
      />
    </div>
  );

  const ThemePreview = ({ theme }: { theme: ColorTheme }) => (
    <motion.button
      onClick={() => handleThemeSelect(theme)}
      className={` py-4 rounded-xl border-2 transition-all flex justify-center items-center ${
        localSettings.selectedTheme === theme.name
          ? "border-info bg-light1 dark:bg-dark1/10"
          : "border-border-light dark:border-border-dark hover:border-info/50"
      }`}
      style={{ backgroundColor: theme.colors.dark1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center gap-2 ">
        <span className="font-medium text-text-light dark:text-text-dark">
          {theme.name}
        </span>
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
        <h2 className="font-display text-xl font-bold text-text-light dark:text-text-dark flex items-center gap-2">
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
          <h3 className="font-display text-lg font-semibold text-text-light dark:text-text-dark mb-4">
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
            <h3 className="font-display text-lg font-semibold text-text-light dark:text-text-dark">
              Custom Accent Color
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
            <ColorPicker
              label="Light Mode"
              colorKey="light1"
              value={localSettings.customColors.light1}
            />
            <ColorPicker
              label="Dark Mode"
              colorKey="dark1"
              value={localSettings.customColors.dark1}
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t border-border-light dark:border-border-dark pt-6">
          <motion.button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-3 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 dark:bg-dark1/90 transition-all"
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
