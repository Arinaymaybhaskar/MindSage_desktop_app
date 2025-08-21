export {};

interface IElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  onWindowStateChange: any;
  openExternal: (url: string) => Promise<any>;

  auth: {
    login: (
      mode: "online" | "offline",
      credentials: LoginCredentials
    ) => Promise<AuthResponse>;
    register: (
      mode: "online" | "offline",
      details: RegistrationDetails
    ) => Promise<{ user: UserInfo }>;
  };
}

// Extend the global Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
