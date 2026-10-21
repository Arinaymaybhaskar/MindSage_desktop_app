// The shared AI client: every generation and embedding in the main process
// goes through here, to the built-in engine (llama.js) or to Ollama
// (ollama.js), the advanced option.
import { modelStore } from "../store.js";
import * as builtin from "./llama.js";
import * as ollama from "./ollama.js";

export const PROVIDERS = ["builtin", "ollama"];

/**
 * The chosen provider. Without a choice, an install that already picked
 * Ollama models keeps Ollama, and a new one gets the built-in engine.
 */
export function activeProvider() {
  const chosen = modelStore.get("aiProvider");
  if (PROVIDERS.includes(chosen)) return chosen;
  const picked = modelStore.get("selectedModels") ?? {};
  return Object.keys(picked).length ? "ollama" : "builtin";
}

const provider = () => (activeProvider() === "ollama" ? ollama : builtin);

/**
 * One generation; resolves with the whole answer.
 *
 * @param {string} prompt
 * @param {{ system?: string, schema?: object, json?: boolean,
 *   maxTokens?: number, temperature?: number,
 *   onToken?: (fragment: string, full: string) => void,
 *   signal?: AbortSignal, ollamaModel?: string, model?: string }} [options]
 *   `schema` forces JSON of that shape (a grammar, so it always parses);
 *   `json` forces any JSON. No `maxTokens` means the model decides when to
 *   stop. `ollamaModel` names the Ollama model and `model` the built-in one
 *   (an id from models.js); each provider ignores the other's.
 */
export const generate = (prompt, options) =>
  provider().generate(prompt, options);

/** The search embedding of `text` (nomic-embed-text v1.5 on both providers). */
export const embed = (text) => provider().embed(text);

/** The model that answers a call with these options, for provenance. */
export const modelName = (ollamaModel) =>
  activeProvider() === "ollama"
    ? ollamaModel || ollama.defaultModel()
    : builtin.chatModelId();
