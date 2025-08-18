// src/components/settings/AudioSettings.tsx
import React from "react";
import { Save } from "lucide-react";
import { Switch } from "../ui/Switch";
import Select from "../ui/Select";

const AudioSettings = ({ settings, onSettingsSave }) => {
  const [localSettings, setLocalSettings] = React.useState(settings);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (name, value) => {
    setLocalSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    onSettingsSave(localSettings);
  };

  return (
    <div className="bg-white dark:bg-gray-800/50 shadow-lg rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Audio & Voice
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure your voice recording and transcription settings.
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Speech Recognition Language
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Language for voice-to-text entries.
            </p>
          </div>
          <Select
            value={localSettings?.speech_language}
            onChange={(v) => handleChange("speech_language", v)}
            options={[
              { value: "en-US", label: "English (US)" },
              { value: "en-GB", label: "English (UK)" },
              { value: "es-ES", label: "Spanish" },
              { value: "fr-FR", label: "French" },
            ]}
          />
        </div>
        <div className="flex justify-between items-center">
          <div>
            <label className="font-medium text-gray-900 dark:text-gray-100">
              Voice Mood Detection
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Detect mood from your voice recordings.
            </p>
          </div>
          <Switch
            checked={localSettings?.enable_voice_mood}
            onCheckedChange={(v) => handleChange("enable_voice_mood", v)}
          />
        </div>
        <div className="flex justify-end border-t border-gray-200 dark:border-gray-700 pt-6">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all"
          >
            <Save size={16} /> Save Audio Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioSettings;
