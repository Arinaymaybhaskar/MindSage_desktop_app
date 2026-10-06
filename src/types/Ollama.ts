/** Raw model rows returned by the `ollama:models` channel. */

/** The `/api/show` payload Ollama returns for a model, trimmed by the handler. */
export interface OllamaModelInfo {
  modified_at?: string;
  capabilities?: string[];
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
    format?: string;
  };
  [key: string]: unknown;
}

/** One row of `ollama list`, enriched with its `/api/show` info when available. */
export interface OllamaModel {
  name: string;
  size: string;
  modified: string;
  info?: OllamaModelInfo;
}

/** `handleGetOllamaModels` returns `{ error }` instead of a list on a bad token. */
export type OllamaModelsResult = OllamaModel[] | { error: string };

/** Per-task model choices persisted by the `models:get-selected` channel. */
export interface SelectedModels {
  chat?: string;
  vision?: string;
  decision?: string;
}
