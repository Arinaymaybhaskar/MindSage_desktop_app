// --- Type Definitions for API and User data ---

/**
 * Describes the structure of the user information object.
 */
interface UserInfo {
  username: string;
  email: string;
  full_name: string;
  timezone: string;
  created_at: string;
}

/**
 * Describes the successful response from a login or registration call.
 */
interface AuthResponse {
  accessToken: string;
  userInfo: UserInfo;
}

/**
 * Describes the credentials required for a standard login.
 */
interface LoginCredentials {
  identifier: string;
  password?: string; // Password might be optional for some auth modes in the future
}

/**
 * Describes the details required for user registration.
 */
interface RegistrationDetails {
  username: string;
  email: string;
  password: string;
  full_name: string;
  timezone: string;
}

// --- Type Definition for the Electron Preload API ---

/**
 * This interface defines the shape of the API exposed from the main process
 * via the preload script. This gives us type safety for our IPC calls.
 */

/**
 * This service abstracts the calls to the Electron main process.
 * Components don't need to know about `window.electronAPI`.
 */
export const authService = {
  /**
   * @param credentials - { identifier, password }
   */
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    if (!window.electron?.ipcRenderer) {
      console.error("Electron API is not available.");
      throw new Error("Not in an Electron environment.");
    }
    return await window.electron.ipcRenderer.invoke("auth:login", credentials);
  },

  /**
   * @param details - { username, email, password, ... }
   */
  register: async (
    details: RegistrationDetails,
  ): Promise<{ user: UserInfo }> => {
    if (!window.electron?.ipcRenderer) {
      throw new Error("Not in an Electron environment.");
    }
    return await window.electron.ipcRenderer.invoke("auth:register", details);
  },

  /**
   * Reports whether a username is still free, so the registration form can
   * say so while the user types. Registration re-checks before inserting, so
   * this is a courtesy rather than the guarantee.
   */
  checkUsername: async (username: string): Promise<{ available: boolean }> => {
    if (!window.electron?.ipcRenderer) {
      throw new Error("Not in an Electron environment.");
    }
    return await window.electron.ipcRenderer.invoke(
      "auth:check-username",
      username,
    );
  },
};
