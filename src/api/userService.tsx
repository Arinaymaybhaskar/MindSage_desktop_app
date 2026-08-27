import type {
  ProfileUpdate,
  UserInfo,
  UserSettings,
} from "../types/User";

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
    payload: ProfileUpdate
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
