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
interface IElectronAPI {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    onWindowStateChange: any;
    
    auth: {
        login: (mode: 'online' | 'offline', credentials: LoginCredentials) => Promise<AuthResponse>;
        register: (mode: 'online' | 'offline', details: RegistrationDetails) => Promise<{ user: UserInfo }>;
    }
}

// Extend the global Window interface
declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}


/**
 * This service abstracts the calls to the Electron main process.
 * Components don't need to know about `window.electronAPI`.
 */
export const authService = {
    /**
     * @param mode - 'online' or 'offline'
     * @param credentials - { identifier, password }
     */
    login: async (mode: 'online' | 'offline', credentials: LoginCredentials): Promise<AuthResponse> => {
    if (!window.electron?.ipcRenderer) {
        console.error("Electron API is not available.");
        throw new Error("Not in an Electron environment.");
    }
    return await window.electron.ipcRenderer.invoke('auth:login', mode, credentials);
},

    /**
     * @param mode - 'online' or 'offline'
     * @param details - { username, email, password, ... }
     */
    register: async (mode: 'online' | 'offline', details: RegistrationDetails): Promise<{ user: UserInfo }> => {
        if (!window.electron?.ipcRenderer) {
            throw new Error("Not in an Electron environment.");
        }
        return await window.electron.ipcRenderer.invoke('auth:register', mode, details);
    },
};
