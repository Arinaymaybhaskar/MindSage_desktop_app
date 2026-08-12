// Assuming you have a types file for shared interfaces
// e.g., src/renderer/src/types/index.ts
interface UserInfo {
    id: number;
    username: string;
    email: string;
    full_name?: string | null;
    created_at?: string;
    entriesCount?: number;
    lastEntryDate?: string | null;
}

interface UserSettings {
  user_id: number;
  dark_mode?: boolean;
  font_size?: string;
  auto_save_interval: number;
  speech_language: string;
  biometric_lock: boolean;
  send_to_ai: boolean;
  journal_reminder: boolean;
  check_in_frequency: string;
  ai_tone: string;
  breathing_reminder: boolean;
  auto_summarize: boolean;
  ai_tags: boolean;
  insight_tone: string;
  enable_ai_image: boolean;
  enable_voice_mood: boolean;
  enable_smart_prompts: boolean;
  auto_save_timer: number;
  journal_streaks: boolean;
  weekly_summary_email: boolean;
  journaling_goal: number;
  custom_colors?: string;
  selected_theme?: string;
  use_custom_colors?: boolean;
}

/**
 * Checks if the app is running in an Electron environment.
 * Throws an error if the preload API is not available.
 */
const checkElectron = () => {
    if (!window.electron?.ipcRenderer) {
        throw new Error("Not in an Electron environment.");
    }
};

/**
 * A service for handling all user-related actions, such as fetching profiles
 * and updating settings, for both online and offline modes.
 */
export const userService = {
  /**
   * Fetches the current user's profile information.
   * @param mode - 'online' or 'offline'
   * @param token - The user's access token.
   */
  getMe: async (
    mode: "online" | "offline",
    token: string
  ): Promise<UserInfo> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("user:get-me", mode, token);
  },

  /**
   * Updates the current user's profile.
   * @param mode - 'online' or 'offline'
   * @param token - The user's access token.
   * @param payload - The data to update (e.g., { username, email }).
   */
  updateProfile: async (
    mode: "online" | "offline",
    token: string,
    payload: { username: string; email: string; full_name?: string }
  ): Promise<{ user: UserInfo }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:update-profile",
      mode,
      token,
      payload
    );
  },

  /**
   * Fetches the current user's settings.
   * @param mode - 'online' or 'offline'
   * @param token - The user's access token.
   */
  getSettings: async (
    mode: "online" | "offline",
    token: string
  ): Promise<UserSettings> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:get-settings",
      mode,
      token
    );
  },

  /**
   * Updates the current user's settings.
   * @param mode - 'online' | 'offline'
   * @param token - The user's access token.
   * @param payload - The settings to update.
   */
  updateSettings: async (
    mode: "online" | "offline",
    token: string,
    payload: Partial<UserSettings>
  ): Promise<UserSettings> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:update-settings",
      mode,
      token,
      payload
    );
  },

  /**
   * Changes the current user's password.
   * @param mode - 'online' | 'offline'
   * @param token - The user's access token.
   * @param payload - { old_password, new_password }.
   */
  changePassword: async (
    mode: "online" | "offline",
    token: string,
    payload: { old_password: string; new_password: string }
  ): Promise<{ message: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:change-password",
      mode,
      token,
      payload
    );
  },

  /**
   * Deletes the current user's account.
   * @param mode - 'online' | 'offline'
   * @param token - The user's access token.
   * @param payload - { password }.
   */
  deleteAccount: async (
    mode: "online" | "offline",
    token: string,
    payload: { password: string }
  ): Promise<{ message: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:delete-account",
      mode,
      token,
      payload
    );
  },
};
