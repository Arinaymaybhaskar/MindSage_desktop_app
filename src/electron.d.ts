export {};

/**
 * Type surface for the context bridge exposed by `electron/preload.js`.
 *
 * The IPC boundary is dynamic by nature: a channel name is a string and the
 * main-process handler on the other side decides the payload shape. Rather
 * than widen every result to `any`, `invoke` is generic and defaults to
 * `unknown`, so callers state the shape they expect -- either explicitly
 * (`invoke<JournalEntry[]>(...)`) or through the contextual return type of the
 * `src/api/*Service` wrapper that owns the channel.
 */
declare global {
  /** Removes the listener that registered it. */
  type Unsubscribe = () => void;

  interface ElectronBridge {
    minimize: () => void;
    maximize: () => void;
    close: () => void;

    zoom: {
      set: (factor: number) => void;
      get: () => number;
    };

    send: (channel: string, ...args: unknown[]) => void;

    onStatusUpdate: <T = unknown>(callback: (status: T) => void) => Unsubscribe;
    removeStatusUpdateListener: () => void;

    /** Fires with the new maximized state whenever the window is restored or maximized. */
    onWindowStateChange: (
      callback: (isMaximized: boolean) => void,
    ) => Unsubscribe;

    ipcRenderer: {
      invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
      on: <T extends unknown[] = unknown[]>(
        channel: string,
        func: (...args: T) => void,
      ) => Unsubscribe;
      removeAllListeners: (channel: string) => void;
    };

    openExternal: (url: string) => Promise<void>;

    onAIStarted: (callback: (data: unknown) => void) => void;
    onAICompleted: (callback: (data: unknown) => void) => void;
    onChatResponseGenerated: (callback: (data: unknown) => void) => void;
    onChatError: (callback: (error: unknown) => void) => void;
    onAIStatusEvent: (callback: (event: string, data: unknown) => void) => void;
  }

  interface Window {
    electron: ElectronBridge;
  }
}
