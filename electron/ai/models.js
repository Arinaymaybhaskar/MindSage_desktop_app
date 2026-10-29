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
  // Offered only on request, never recommended (picker.js ON_REQUEST).
  "llama-3.1-8b": {
    label: "Llama 3.1 8B",
    role: "chat",
    file: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    url: `${HF}/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/bf5b95e96dac0462e2a09145ec66cae9a3f12067/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf`,
    bytes: 4920739232,
    sha256: "7b064f5842bf9532c91456deda288a1b672397a54fa729aa665952863033557c",
  },
  "nomic-embed-text-v1.5": {
    label: "nomic-embed-text v1.5",
    role: "embed",
    file: "nomic-embed-text-v1.5.f16.gguf",
    url: `${HF}/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/0188c9bf409793f810680a5a431e7b899c46104c/nomic-embed-text-v1.5.f16.gguf`,
    bytes: 274290560,
    sha256: "f7af6f66802f4df86eda10fe9bbcfc75c39562bed48ef6ace719a251cf1c2fdb",
  },
  // Voice (dictation) models, fetched on first use instead of bundled (KAN-91).
  // Revision and SHA-256 are Hugging Face's own: X-Repo-Commit and X-Linked-ETag
  // of ggerganov/whisper.cpp, read 2026-10-22.
  "whisper-base-en": {
    label: "Voice model: English (base.en)",
    role: "voice",
    file: "ggml-base.en.bin",
    url: `${HF}/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.en.bin`,
    bytes: 147964211,
    sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
  },
  "whisper-small": {
    label: "Voice model: Hindi and other languages (small)",
    role: "voice",
    file: "ggml-small.bin",
    url: `${HF}/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.bin`,
    bytes: 487601967,
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
  },
  // The CUDA build of llama.cpp for Nvidia GPUs (KAN-434): the installer ships
  // the CPU and Vulkan builds only. The npm tarball of the exact version
  // node-llama-cpp needs; its SHA-512 matches package-lock.json, SHA-256 read
  // from the same bytes 2026-10-29. Unpacked by ai/cuda.js, never run packed.
  "cuda-engine": {
    label: "GPU engine for Nvidia (CUDA)",
    role: "engine",
    file: "win-x64-cuda-3.22.1.tgz",
    url: "https://registry.npmjs.org/@node-llama-cpp/win-x64-cuda/-/win-x64-cuda-3.22.1.tgz",
    // The registry serves the file itself; a redirect is refused.
    redirect: "error",
    bytes: 138519723,
    unpackedBytes: 176103306,
    sha256: "5209bfeb4e1845bc99b70e906797935379ffa65a5ac44a8f6e3b36b9948483af",
  },
  // The CPU ONNX models (KAN-388, ai/onnx.js): feeling words on save, and the
  // check that a summary says only what its entry says. Neither needs Ollama
  // or the llama engine. Revisions and SHA-256 are Hugging Face's own (the
  // API's sha and lfs.sha256), read 2026-10-29; the tokenizer is not in LFS,
  // so its SHA-256 was computed from the file downloaded at that revision the
  // same day. Both models use the RoBERTa vocabulary: one tokenizer serves both.
  "feelings-classifier": {
    label: "Feelings classifier (GoEmotions)",
    role: "onnx",
    file: "roberta-base-go_emotions-int8.onnx",
    url: `${HF}/SamLowe/roberta-base-go_emotions-onnx/resolve/90ee0c1c4796d370e68968687b8ba51fc11224f4/onnx/model_quantized.onnx`,
    bytes: 125397543,
    sha256: "0c1981c5b479674747911c8e2228f0c4ec90bf47bf66e830f7d4fc62be082958",
  },
  "summary-check": {
    label: "Summary check (MiniLM NLI)",
    role: "onnx",
    file: "nli-MiniLM2-L6-H768-quint8-avx2.onnx",
    url: `${HF}/cross-encoder/nli-MiniLM2-L6-H768/resolve/b95119ce93d3e065de6214e38cd4a97b0f2f2c6d/onnx/model_quint8_avx2.onnx`,
    bytes: 82823063,
    sha256: "44391a5241a62e0083c1a8899a71e69a092b95aea5ba89e14062925468eceac7",
  },
  "roberta-tokenizer": {
    label: "Tokenizer for the classifier and summary check",
    role: "onnx",
    file: "roberta-tokenizer.json",
    url: `${HF}/cross-encoder/nli-MiniLM2-L6-H768/resolve/b95119ce93d3e065de6214e38cd4a97b0f2f2c6d/tokenizer.json`,
    bytes: 1356048,
    sha256: "82139106e603ee4e1d5bc99d056ccbed5a92bc24848b1b5a7137c26e00d0dbf6",
  },
};

export const ONNX_MODELS = {
  classifier: "feelings-classifier",
  nli: "summary-check",
  tokenizer: "roberta-tokenizer",
};

export const CUDA_ENGINE = "cuda-engine";

/** Voice models, best first: the multilingual small one wins when both are here. */
export const VOICE_MODELS = ["whisper-small", "whisper-base-en"];

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
