// Renderer wrapper for the per-profile AI feature switches (KAN-70, KAN-437).
// Only the window.electron IPC bridge, never Node.

/**
 * enrich: title, summary and mood word after saving. feelings: the AI offers
 * feeling words, saved only when ticked. suggestions: autocomplete.
 */
export type AIFeature = "enrich" | "feelings" | "suggestions";

export type AIFeatures = Record<AIFeature, boolean>;

const hasElectron = () => !!window.electron?.ipcRenderer;

export const aiFeaturesService = {
  get: async (): Promise<AIFeatures | null> =>
    hasElectron()
      ? window.electron.ipcRenderer.invoke<AIFeatures>("ai:get-features")
      : null,

  /** Stops future calls of that type; saved data stays. Returns all switches. */
  set: async (
    feature: AIFeature,
    enabled: boolean,
  ): Promise<AIFeatures | null> =>
    hasElectron()
      ? window.electron.ipcRenderer.invoke<AIFeatures>(
          "ai:set-feature",
          feature,
          enabled,
        )
      : null,
};
