import { useState, useEffect } from "react";
import { Save } from "lucide-react";
// Assuming you have a custom Switch and a themed Dropdown component
import { Switch } from "../ui/Switch";
import { Dropdown } from "../ui/Dropdown";

const AppearanceSettings = ({ settings, onSettingsSave }) => {
  const [localSettings, setLocalSettings] = useState({
    dark_mode: false,
    font_size: "medium",
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        dark_mode: settings.dark_mode || false,
        font_size: settings.font_size || "medium",
      });
    }
  }, [settings]);

  const handleChange = (name, value) => {
    setLocalSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onSettingsSave({ ...settings, ...localSettings });
  };

  const fontSizeOptions = [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
  ];

  return (
    // --- CHANGE: Themed main container ---
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Appearance
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Customize how the app looks and feels.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Dark Mode Setting */}
        <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Dark Mode
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Reduce eye strain in low-light environments.
            </p>
          </div>
          <Switch
            checked={localSettings.dark_mode}
            onCheckedChange={(v) => handleChange("dark_mode", v)}
          />
        </div>

        {/* Font Size Setting */}
        <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Font Size
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Adjust the text size for readability.
            </p>
          </div>
          <div className="w-32 text-sm text-text-light dark:text-text-dark">
            <Dropdown
              placeholder={"Choose size"}
              options={fontSizeOptions}
              selectedValue={localSettings.font_size}
              onSelect={(v) => handleChange("font_size", v)}
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t border-border-light dark:border-border-dark pt-6">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 dark:bg-dark1/90 transition-all"
          >
            <Save size={16} /> Save Appearance
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppearanceSettings;
