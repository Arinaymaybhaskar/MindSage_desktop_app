// --- Type Definitions for API and User data ---

/**
 * Describes the structure of the user information object.
 */
interface UserInfo {
  id: number;
  username: string;
  timezone: string;
  created_at: string;
}

/**
 * Describes the successful response from a login or registration call.
 */
interface AuthResponse {
  userInfo: UserInfo;
}

/**
 * Describes the credentials required for a standard login.
 */
interface LoginCredentials {
  identifier: string;
  password?: string; // Password might be optional for some auth modes in the future
  /** Stay signed in across launches; otherwise the next launch asks again. */
  rememberMe?: boolean;
}

/**
 * One account on this install, as the profile picker shows it. `avatar` is a
 * ready-to-use data URL, or null when the user never set a picture.
 */
export interface Profile {
  id: number;
  username: string;
  avatar: string | null;
}

/**
 * Describes the details required for user registration. `username` is the
 * profile name; sign-up asks for no email and no full name.
 */
interface RegistrationDetails {
  username: string;
  password: string;
  timezone: string;
  photo?: { arrayBuffer: ArrayBuffer; filename: string };
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
   * @param details - { username, password, timezone, photo? }
   */
  register: async (
    details: RegistrationDetails,
  ): Promise<{ user: UserInfo }> => {
    if (!window.electron?.ipcRenderer) {
      throw new Error("Not in an Electron environment.");
    }
    return await window.electron.ipcRenderer.invoke("auth:register", details);
  },

  /** Every account on this install, for the signed-out profile picker. */
  listProfiles: async (): Promise<Profile[]> => {
    if (!window.electron?.ipcRenderer) return [];
    return await window.electron.ipcRenderer.invoke("auth:list-profiles");
  },

  /**
   * Reports whether a profile name is allowed and still free, with the reason
   * when it is not, so the registration form can say so while the user types.
   * Registration re-checks before inserting, so this is a courtesy rather
   * than the guarantee.
   */
  checkUsername: async (
    username: string,
  ): Promise<{ available: boolean; error?: string }> => {
    if (!window.electron?.ipcRenderer) {
      throw new Error("Not in an Electron environment.");
    }
    return await window.electron.ipcRenderer.invoke(
      "auth:check-username",
      username,
    );
  },
};
