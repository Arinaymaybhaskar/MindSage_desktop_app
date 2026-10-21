// The models the built-in engine (node-llama-cpp) can download and run. Pure:
// no electron or native imports, so the choices are unit-tested.

const HF = "https://huggingface.co";
const GiB = 2 ** 30;

/**
 * Each file is pinned to a repository revision, so its SHA-256 never changes
 * under us. The embedding model is the F16 build of nomic-embed-text v1.5,
 * the weights Ollama serves as nomic-embed-text:v1.5, so vectors already in
 * the search index stay comparable when a profile moves off Ollama.
 */
export const BUILTIN_MODELS = {
  "llama-3.2-3b": {
    label: "Llama 3.2 3B",
    role: "chat",
    file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    url: `${HF}/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/5ab33fa94d1d04e903623ae72c95d1696f09f9e8/Llama-3.2-3B-Instruct-Q4_K_M.gguf`,
    bytes: 2019377696,
    sha256: "6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff",
  },
  "qwen-2.5-1.5b": {
    label: "Qwen 2.5 1.5B",
    role: "chat",
    file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    url: `${HF}/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf`,
    bytes: 1117320736,
    sha256: "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e",
  },
  "nomic-embed-text-v1.5": {
    label: "nomic-embed-text v1.5",
    role: "embed",
    file: "nomic-embed-text-v1.5.f16.gguf",
    url: `${HF}/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/0188c9bf409793f810680a5a431e7b899c46104c/nomic-embed-text-v1.5.f16.gguf`,
    bytes: 274290560,
    sha256: "f7af6f66802f4df86eda10fe9bbcfc75c39562bed48ef6ace719a251cf1c2fdb",
  },
};

export const EMBED_MODEL = "nomic-embed-text-v1.5";

/**
 * The model each entry-enrichment call runs on, when it is downloaded (KAN-89).
 * Measured: the 3B gets the feeling group right more often, Qwen 2.5 1.5B
 * writes the more faithful summaries, and two calls take as long as one merged.
 */
export const TASK_MODELS = {
  metadata: "llama-3.2-3b",
  summary: "qwen-2.5-1.5b",
};

/** The chat model a machine gets unless one was chosen: 8 GB PCs get the lighter one. */
export function defaultChatModel(totalMemBytes) {
  return totalMemBytes < 10 * GiB ? "qwen-2.5-1.5b" : "llama-3.2-3b";
}

/** Whether a model of this size can run here at all, leaving room for the OS and the app. */
export function fitsInMemory(modelBytes, totalMemBytes) {
  return modelBytes * 1.3 + 2 * GiB <= totalMemBytes;
}
