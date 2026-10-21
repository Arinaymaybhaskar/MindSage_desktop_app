// Renderer wrapper for the Advanced setup (KAN-79): check and choose the AI
// provider. The .gguf file is picked in a dialog the main process opens; no
// path ever comes from here. Only the window.electron IPC bridge, never Node.

export type AdvancedProvider = "ollama" | "openai" | "gguf";

export interface OpenAIConfig {
  /** Loopback only, e.g. http://localhost. */
  url: string;
  /** LM Studio's default is 1234. */
  port?: number;
  model: string;
  embedModel: string;
}

export interface ProviderConfig {
  provider: "builtin" | "ollama" | "openai" | "gguf";
  openai: OpenAIConfig;
  /** File name of the chosen .gguf, never its path. */
  gguf: string | null;
}

export type ProviderCheck = { ok: true } | { ok: false; error: string };
export type GgufPick =
  | { canceled: true }
  | { ok: true; name: string; bytes: number }
  | { ok: false; error: string };

const hasElectron = () => !!window.electron?.ipcRenderer;
const invoke = <T>(channel: string, ...args: unknown[]) =>
  window.electron.ipcRenderer.invoke<T>(channel, ...args);

export const aiProviderService = {
  get: async (): Promise<ProviderConfig | null> =>
    hasElectron() ? invoke<ProviderConfig>("ai:provider-get") : null,

  /** Opens the file dialog; a file that is not a usable GGUF is refused. */
  pickGguf: async (): Promise<GgufPick | null> =>
    hasElectron() ? invoke<GgufPick>("ai:provider-pick-gguf") : null,

  /** Validates without saving; call again to retry. */
  check: async (
    kind: AdvancedProvider,
    config?: Partial<OpenAIConfig>,
  ): Promise<ProviderCheck | null> =>
    hasElectron()
      ? invoke<ProviderCheck>("ai:provider-check", kind, config)
      : null,

  /** Validates, then saves and switches; `error` leaves everything as it was. */
  apply: async (
    kind: AdvancedProvider,
    config?: Partial<OpenAIConfig>,
  ): Promise<{ success?: true; error?: string } | null> =>
    hasElectron() ? invoke("ai:provider-apply", kind, config) : null,
};
