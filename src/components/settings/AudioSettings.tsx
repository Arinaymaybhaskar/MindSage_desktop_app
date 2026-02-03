import React, { useState, useEffect, useMemo } from "react";
import { Save } from "lucide-react";
import { Switch } from "../ui/Switch";
import { Dropdown } from "../ui/Dropdown";

const AudioSettings = ({ settings, onSettingsSave }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (name, value) => {
    setLocalSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onSettingsSave(localSettings);
  };

  const languageOptions = useMemo(
    () => [
      { value: "en-US", label: "English (US)" },
      { value: "en-GB", label: "English (UK)" },
      { value: "es-ES", label: "Spanish" },
      { value: "fr-FR", label: "French" },
    ],
    []
  );

  return (
    <div className="bg-secondary-light dark:bg-secondary-dark shadow-lg rounded-2xl border border-border-light dark:border-border-dark">
      <div className="p-6 border-b border-border-light dark:border-border-dark">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">
          Audio & Voice
        </h2>
        <p className="text-sm text-text-light-sub dark:text-text-dark-sub mt-1">
          Configure your voice recording and transcription settings.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Speech Recognition Language Setting */}
        <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Speech Recognition Language
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Language for voice-to-text entries.
            </p>
          </div>
          <div className="w-40 text-sm text-text-light dark:text-text-dark">
            <Dropdown
              placeholder={"Choose language"}
              options={languageOptions}
              selectedValue={localSettings?.speech_language}
              onSelect={(v) => handleChange("speech_language", v)}
            />
          </div>
        </div>

        {/* Voice Mood Detection Setting */}
        <div className="flex justify-between items-center p-4 rounded-lg bg-tertiary-light dark:bg-tertiary-dark">
          <div>
            <label className="font-medium text-text-light dark:text-text-dark">
              Voice Mood Detection
            </label>
            <p className="text-sm text-text-light-sub dark:text-text-dark-sub">
              Detect mood from your voice recordings.
            </p>
          </div>
          <Switch
            checked={localSettings?.enable_voice_mood}
            onCheckedChange={(v) => handleChange("enable_voice_mood", v)}
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t border-border-light dark:border-border-dark pt-6">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-light1 dark:bg-dark1 text-white font-semibold rounded-lg shadow-md hover:bg-light1 dark:bg-dark1/90 transition-all"
          >
            <Save size={16} /> Save Audio Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioSettings;
