import { useEffect, useState } from "react";
import { Switch } from "../components/ui/Switch";
import { Input } from "../components/ui/Input";
import api from "../api/axios";
import {
  BellIcon,
  BrainIcon,
  ExternalLinkIcon,
  LockIcon,
  MicIcon,
  MoonIcon,
  SaveIcon,
  SunIcon,
  TargetIcon,
} from "lucide-react";
import Select from "../components/ui/Select";
import { Link } from "react-router-dom";

const Settings = () => {
  const [settings, setSettings] = useState({
    dark_mode: false,
    font_size: "medium",
    auto_save_interval: 5,
    speech_language: "en-US",
    biometric_lock: false,
    send_to_ai: true,
    journal_reminder: true,
    challenge_alert: true,
    check_in_frequency: "daily",
    ai_tone: "supportive",
    breathing_reminder: false,
    daily_challenge_type: "reflective",
    auto_summarize: true,
    ai_tags: true,
    insight_tone: "emotional",
    enable_ai_image: false,
    enable_voice_mood: false,
    enable_smart_prompts: false,
    auto_save_timer: 60,
    journal_streaks: true,
    weekly_summary_email: true,
    journaling_goal: 5,
  });
  const [formData, setFormData] = useState<{
    name: string;
    username: string;
    email: string;
  }>({
    name: "",
    username: "",
    email: "",
  });

  const handleChange = (name: string, value: boolean | string | number) => {
    setSettings({ ...settings, [name]: value });
  };

  const getSettings = async () => {
    // API call to fetch settings
    const settings = JSON.parse(
      localStorage.getItem("userSettings") ||
        (await api.get("/users/me/settings").then((res) => {
          localStorage.setItem("userSettings", JSON.stringify(res.data));
          return res.data;
        }))
    );
    // convert snake_case to camelCase
    setSettings(settings);
  };

  useEffect(() => {
    getSettings();
  }, []);

  const saveSettings = async () => {
    await api.put("/users/me/settings", settings).then((res) => {
      localStorage.removeItem("userSettings");
      localStorage.setItem("userSettings", JSON.stringify(res.data));
    });
    alert("Settings saved successfully!");
  };

  const handleProfileSubmit = () => {
    console.log(formData);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <button
          onClick={saveSettings}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <SaveIcon className="w-4 h-4 mr-2" />
          Save Settings
        </button>
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            Profile Information
          </h2>
          <p className="text-sm text-gray-500">
            Update your account's profile information
          </p>
        </div>
        <form onSubmit={handleProfileSubmit} className="p-6">
          <div className="mb-4">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              <SaveIcon className="h-4 w-4 mr-2" />
              Save Profile
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Data Export</h2>
          <p className="text-sm text-gray-500">Export all your journal data</p>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            You can export all your journal entries and user data for backup or
            migration purposes.
          </p>
          <Link to="/data-export" className="inline-flex items-center text-indigo-600 hover:text-indigo-800">
            Learn more about data exports
            <ExternalLinkIcon className="h-4 w-4 ml-1" />
          </Link>
        </div>
      </div>
      {/* Appearance Settings */}
      <div className="mb-10">
        <div className="flex items-center mb-4">
          {settings.dark_mode ? (
            <MoonIcon className="w-5 h-5 text-indigo-600 mr-2" />
          ) : (
            <SunIcon className="w-5 h-5 text-indigo-600 mr-2" />
          )}
          <h2 className="text-lg font-medium text-gray-900">Appearance</h2>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Dark Mode
              </label>
              <p className="text-sm text-gray-500">
                Enable dark mode for low-light environments
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.dark_mode}
                onCheckedChange={(v) => handleChange("dark_mode", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label
                htmlFor="font_size"
                className="block text-sm font-medium text-gray-700"
              >
                Font Size
              </label>
              <p className="text-sm text-gray-500">
                Adjust the text size throughout the app
              </p>
            </div>
            <Select
              id="font_size"
              value={settings.font_size}
              onChange={(e) => handleChange("font_size", e)}
              options={[
                {
                  value: "small",
                  label: "Small",
                },
                {
                  value: "medium",
                  label: "Medium",
                },
                {
                  value: "large",
                  label: "Large",
                },
                {
                  value: "x-large",
                  label: "Extra Large",
                },
              ]}
              size="md"
              className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            ></Select>
          </div>
        </div>
      </div>
      {/* AI Features */}
      <div className="mb-10">
        <div className="flex items-center mb-4">
          <BrainIcon className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">AI Features</h2>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Send to AI for Analysis
              </label>
              <p className="text-sm text-gray-500">
                Allow AI to analyze your entries for insights
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.send_to_ai}
                onCheckedChange={(v) => handleChange("send_to_ai", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Auto-Summarize Entries
              </label>
              <p className="text-sm text-gray-500">
                Create AI summaries of your journal entries
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.auto_summarize}
                onCheckedChange={(v) => handleChange("auto_summarize", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                AI-Generated Tags
              </label>
              <p className="text-sm text-gray-500">
                Automatically generate tags for your entries
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.ai_tags}
                onCheckedChange={(v) => handleChange("ai_tags", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label
                htmlFor="ai_tone"
                className="block text-sm font-medium text-gray-700"
              >
                AI Tone
              </label>
              <p className="text-sm text-gray-500">
                Set the tone for AI responses
              </p>
            </div>
            <Select
              id="ai_tone"
              value={settings.ai_tone}
              onChange={(e) => handleChange("ai_tone", e)}
              options={[
                { value: "supportive", label: "Supportive" },
                { value: "neutral", label: "Neutral" },
                { value: "direct", label: "Direct" },
              ]}
              size="md"
              className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label
                htmlFor="insight_tone"
                className="block text-sm font-medium text-gray-700"
              >
                Insight Focus
              </label>
              <p className="text-sm text-gray-500">
                What insights should the AI focus on
              </p>
            </div>
            <Select
              id="insight_tone"
              value={settings.insight_tone}
              onChange={(e) => handleChange("insight_tone", e)}
              options={[
                { value: "emotional", label: "Emotional" },
                { value: "growth", label: "Growth Mindset" },
                { value: "neutral", label: "Neutral" },
                { value: "balanced", label: "Balanced" },
              ]}
              size="md"
              className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Enable AI Image Generation{" "}
                <span className="text-xs text-yellow-600 font-semibold">
                  (Experimental)
                </span>
              </label>
              <p className="text-sm text-gray-500">
                Generate images based on your entries
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.enable_ai_image}
                onCheckedChange={(v) => handleChange("enable_ai_image", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Smart Writing Prompts{" "}
                <span className="text-xs text-yellow-600 font-semibold">
                  (Experimental)
                </span>
              </label>
              <p className="text-sm text-gray-500">
                Personalized prompts based on past entries
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.enable_smart_prompts}
                onCheckedChange={(v) => handleChange("enable_smart_prompts", v)}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Audio & Voice */}
      <div className="mb-10">
        <div className="flex items-center mb-4">
          <MicIcon className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">Audio & Voice</h2>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <label
                htmlFor="speech_language"
                className="block text-sm font-medium text-gray-700"
              >
                Speech Recognition Language
              </label>
              <p className="text-sm text-gray-500">
                Language for voice entries
              </p>
            </div>
            <Select
              id="speech_language"
              value={settings.speech_language}
              onChange={(e) => handleChange("speech_language", e)}
              options={[
                { value: "en-US", label: "English (US)" },
                { value: "en-GB", label: "English (UK)" },
                { value: "es-ES", label: "Spanish (Spain)" },
                { value: "fr-FR", label: "French (France)" },
                { value: "de-DE", label: "German (Germany)" },
              ]}
            />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Voice Mood Detection{" "}
                <span className="text-xs text-yellow-600 font-semibold">
                  (Experimental)
                </span>
              </label>
              <p className="text-sm text-gray-500">
                Detect mood from voice recordings
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.enable_voice_mood}
                onCheckedChange={(v) => handleChange("enable_voice_mood", v)}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Notifications & Reminders */}
      <div className="mb-10">
        <div className="flex items-center mb-4">
          <BellIcon className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">
            Notifications & Reminders
          </h2>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Journal Reminders
              </label>
              <p className="text-sm text-gray-500">
                Remind you to write in your journal
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.journal_reminder}
                onCheckedChange={(v) => handleChange("journal_reminder", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Daily Challenge Alerts
              </label>
              <p className="text-sm text-gray-500">
                Notify about new journaling challenges
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.challenge_alert}
                onCheckedChange={(v) => handleChange("challenge_alert", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Breathing Reminders
              </label>
              <p className="text-sm text-gray-500">
                Periodic reminders to take deep breaths
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.breathing_reminder}
                onCheckedChange={(v) => handleChange("breathing_reminder", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label
                htmlFor="check_in_frequency"
                className="block text-sm font-medium text-gray-700"
              >
                Check-in Frequency
              </label>
              <p className="text-sm text-gray-500">
                How often to remind you to journal
              </p>
            </div>
            <Select
              id="check_in_frequency"
              value={settings.check_in_frequency}
              onChange={(e) => handleChange("check_in_frequency", e)}
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "never", label: "Never" },
              ]}
            />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Weekly Summary Email
              </label>
              <p className="text-sm text-gray-500">
                Receive a weekly summary of your journaling
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.weekly_summary_email}
                onCheckedChange={(v) => handleChange("weekly_summary_email", v)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Save Settings */}
      <div className="mb-10">
        <div className="flex items-center mb-4">
          <SaveIcon className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">Auto-Save</h2>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
          <div>
            <label
              htmlFor="auto_save_interval"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Auto-save interval (minutes)
            </label>
            <Input
              id="auto_save_interval"
              type="range"
              min="1"
              max="30"
              value={settings.auto_save_interval}
              onChange={(e) =>
                handleChange("auto_save_interval", parseInt(e.target.value))
              }
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 min</span>
              <span>{settings.auto_save_interval} min</span>
              <span>30 min</span>
            </div>
          </div>
        </div>
      </div>
      {/* Goals & Challenges */}
      <div className="mb-10">
        <div className="flex items-center mb-4">
          <TargetIcon className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">
            Goals & Challenges
          </h2>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Track Journal Streaks
              </label>
              <p className="text-sm text-gray-500">
                Track consecutive days of journaling
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.journal_streaks}
                onCheckedChange={(v) => handleChange("journal_streaks", v)}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="journaling_goal"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Weekly Journaling Goal (entries per week)
            </label>
            <Input
              id="journaling_goal"
              type="range"
              min="1"
              max="14"
              value={settings.journaling_goal}
              onChange={(e) =>
                handleChange("journaling_goal", parseInt(e.target.value))
              }
            />
          </div>
          <div className="flex justify-between items-center">
            <div>
              <label
                htmlFor="daily_challenge_type"
                className="block text-sm font-medium text-gray-700"
              >
                Daily Challenge Type
              </label>
              <p className="text-sm text-gray-500">
                Type of daily journaling prompts
              </p>
            </div>
            <Select
              id="daily_challenge_type"
              value={settings.daily_challenge_type}
              onChange={(e) => handleChange("daily_challenge_type", e)}
              options={[
                { value: "reflective", label: "Reflective" },
                { value: "gratitude", label: "Gratitude" },
                { value: "productivity", label: "Productivity" },
                { value: "mixed", label: "Mixed" },
              ]}
              size="md"
              className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
        </div>
      </div>
      {/* Privacy & Security */}
      <div className="mb-10">
        <div className="flex items-center mb-4">
          <LockIcon className="w-5 h-5 text-indigo-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">
            Privacy & Security
          </h2>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Biometric Lock
              </label>
              <p className="text-sm text-gray-500">
                Require biometric authentication to access journal
              </p>
            </div>
            <div className="relative inline-block w-12 align-middle select-none">
              <Switch
                checked={settings.biometric_lock}
                onCheckedChange={(v) => handleChange("biometric_lock", v)}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <Link
                to="/change-password"
                className="block text-sm font-medium text-gray-700"
              >
                Change password
              </Link>
              <p className="text-sm text-gray-500">
                Change your account password
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="text-center mt-8">
        <Link
          to={"/delete-account"}
          className="text-red-600 font-medium hover:underline"
        >
          Delete My Account
        </Link>
      </div>
    </div>
  );
};

export default Settings;
