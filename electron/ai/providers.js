// Checks a provider choice before it is saved (KAN-79): the same answer for
// every option, { ok: true } or { ok: false, error } in words a person can act
// on. Nothing here reads or sends entry text.
import { checkGguf } from "./gguf.js";
import {
  DEFAULT_EMBED_MODEL,
  EMBED_DIMENSIONS,
  call,
  openaiBase,
} from "./openai.js";

const OLLAMA = "http://127.0.0.1:11434";
const TIMEOUT_MS = 3000;
const text = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** What the renderer sent, reduced to the fields the OpenAI provider reads. */
export function cleanOpenai(config) {
  const port = Number(config?.port);
  return {
    url: text(config?.url) || "http://localhost",
    port: Number.isInteger(port) && port > 0 ? port : undefined,
    model: text(config?.model),
    embedModel: text(config?.embedModel) || DEFAULT_EMBED_MODEL,
  };
}

async function checkOllama(fetchImpl) {
  try {
    const res = await fetchImpl(`${OLLAMA}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
  } catch {
    /* falls through to the message */
  }
  return {
    ok: false,
    error: "Ollama is not running. Start Ollama, then try again.",
  };
}

async function checkOpenai(config, fetchImpl) {
  const cfg = cleanOpenai(config);
  const b = openaiBase(cfg);
  if (!b.ok) return b;
  const port = new URL(b.base).port;
  const get = (route, init) =>
    call(
      b.base,
      route,
      { signal: AbortSignal.timeout(TIMEOUT_MS), ...init },
      fetchImpl,
    );
  let models;
  try {
    const res = await get("/v1/models");
    models = res.ok ? await res.json() : null;
  } catch (err) {
    if (err instanceof SyntaxError) models = null;
    else {
      return {
        ok: false,
        error: `Nothing answered on port ${port}. Start the server (LM Studio uses 1234 unless you changed it) or fix the port.`,
      };
    }
  }
  if (!Array.isArray(models?.data)) {
    return {
      ok: false,
      error: `The server on port ${port} does not look OpenAI-compatible.`,
    };
  }
  if (cfg.model && !models.data.some((m) => m?.id === cfg.model)) {
    return {
      ok: false,
      error: `The server does not have a model called ${cfg.model}.`,
    };
  }
  // Search stores nomic-embed-text vectors; any other size would break it.
  try {
    const res = await get("/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.embedModel, input: "test" }),
    });
    const length = res.ok
      ? (await res.json())?.data?.[0]?.embedding?.length
      : 0;
    if (length === EMBED_DIMENSIONS) return { ok: true };
  } catch {
    /* falls through to the message */
  }
  return {
    ok: false,
    error: `Search needs the embedding model ${cfg.embedModel} (${EMBED_DIMENSIONS} dimensions) loaded on the server.`,
  };
}

/**
 * @param {"builtin" | "ollama" | "openai" | "gguf"} kind
 * @param {object} config openai: { url, port, model, embedModel }; gguf: { path }
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function validateProvider(kind, config, fetchImpl = fetch) {
  if (kind === "builtin") return { ok: true };
  if (kind === "ollama") return checkOllama(fetchImpl);
  if (kind === "openai") return checkOpenai(config, fetchImpl);
  if (kind === "gguf") return checkGguf(config?.path);
  return { ok: false, error: "Unknown provider" };
}
