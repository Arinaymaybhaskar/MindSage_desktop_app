// The shared AI client: every generation and embedding in the main process
// goes through here, to the built-in engine (llama.js) or to Ollama
// (ollama.js), the advanced option.
import { modelStore } from "../store.js";
import * as builtin from "./llama.js";
import * as ollama from "./ollama.js";
import * as openai from "./openai.js";
import { checkGguf } from "./gguf.js";

// "openai" is any OpenAI-compatible server on this PC (LM Studio); "gguf" is
// the user's own model file run by the built-in engine (KAN-79). The advanced
// options never become the default: a fresh install stays on the built-in one.
export const PROVIDERS = ["builtin", "ollama", "openai", "gguf"];

/**
 * The chosen provider. Without a choice, the built-in engine runs only once
 * its models are on disk; until then Ollama does, as before, so nobody loses
 * AI while the setup screens for the built-in engine do not exist yet.
 */
export function activeProvider() {
  const chosen = modelStore.get("aiProvider");
  if (PROVIDERS.includes(chosen)) return chosen;
  return builtin.modelsReady() ? "builtin" : "ollama";
}

/** The saved .gguf, checked again before every call (a 24-byte read). */
function useGguf() {
  const checked = checkGguf(modelStore.get("ggufPath"));
  if (!checked.ok) {
    throw Object.assign(new Error(checked.error), { code: "AI_UNAVAILABLE" });
  }
  builtin.setCustomModel(checked);
}

const gguf = {
  generate(prompt, options) {
    useGguf();
    return builtin.generate(prompt, {
      ...options,
      model: builtin.CUSTOM_MODEL,
    });
  },
  embed: (text) => builtin.embed(text),
};

const PROVIDER_IMPL = { builtin, ollama, openai, gguf };
const provider = () => PROVIDER_IMPL[activeProvider()];

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

/** The built-in model for an enrichment task, passed as `model` (Ollama ignores it). */
export const taskModel = (task) => builtin.taskModelId(task);

/** The search embedding of `text` (nomic-embed-text v1.5 on both providers). */
export const embed = (text) => provider().embed(text);

/** The model that answers a call with these options, for provenance. */
export function modelName(ollamaModel) {
  switch (activeProvider()) {
    case "ollama":
      return ollamaModel || ollama.defaultModel();
    case "openai":
      return openai.modelName();
    case "gguf":
      return "custom-gguf";
    default:
      return builtin.chatModelId();
  }
}
