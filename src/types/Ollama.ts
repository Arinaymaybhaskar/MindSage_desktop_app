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

/**
 * One installed model, enriched with its `/api/show` info when available.
 * The field names are historical (they came from splitting `ollama list`):
 * `size` holds the short model ID and `modified` holds the size, e.g. "4.7 GB".
 */
export interface OllamaModel {
  name: string;
  size: string;
  modified: string;
  info?: OllamaModelInfo;
}

/**
 * Why the model list could not be read: Ollama accepted the connection but did
 * not answer in time, nothing is listening, or the reply was unreadable.
 */
export type OllamaListFailure = "timeout" | "unreachable" | "bad-response";

/**
 * `handleGetOllamaModels` returns `{ error }` instead of a list: without a
 * `reason` when signed out, with one when Ollama could not be asked.
 */
export type OllamaModelsResult =
  OllamaModel[] | { error: string; reason?: OllamaListFailure };

/** Per-task model choices persisted by the `models:get-selected` channel. */
export interface SelectedModels {
  chat?: string;
  vision?: string;
  decision?: string;
}
