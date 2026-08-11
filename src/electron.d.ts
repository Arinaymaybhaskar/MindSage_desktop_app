export {};
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeAllListeners: (channel: string) => void;
        onAIStatusEvent: (callback: (event: string, data: any) => void) => void;
      };
      zoom: {
        set: (factor: number) => void;
        get: () => number;
      };
    };
  }
}
