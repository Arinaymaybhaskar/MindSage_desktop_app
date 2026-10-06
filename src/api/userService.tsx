import type { ProfileUpdate, UserInfo, UserSettings } from "../types/User";

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
   */
  getMe: async (): Promise<UserInfo> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("user:get-me");
  },

  /**
   * Updates the current user's profile.
   * @param payload - The data to update (e.g., { username, email }).
   */
  updateProfile: async (
    payload: ProfileUpdate,
  ): Promise<{ user: UserInfo }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:update-profile",
      payload,
    );
  },

  /**
   * Fetches the current user's settings.
   */
  getSettings: async (): Promise<UserSettings> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("user:get-settings");
  },

  /**
   * Updates the current user's settings.
   * @param mode - 'online' | 'offline'
   * @param payload - The settings to update.
   */
  updateSettings: async (
    payload: Partial<UserSettings>,
  ): Promise<UserSettings> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:update-settings",
      payload,
    );
  },

  /**
   * Changes the current user's password.
   * @param mode - 'online' | 'offline'
   * @param payload - { old_password, new_password }.
   */
  changePassword: async (payload: {
    old_password: string;
    new_password: string;
  }): Promise<{ message: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:change-password",
      payload,
    );
  },

  /**
   * Deletes the current user's account.
   * @param mode - 'online' | 'offline'
   * @param payload - { password }.
   */
  deleteAccount: async (payload: {
    password: string;
  }): Promise<{ message: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "user:delete-account",
      payload,
    );
  },
};
