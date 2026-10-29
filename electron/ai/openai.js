// The OpenAI-compatible provider behind the AI client: LM Studio (default
// localhost:1234) or any server speaking /v1/chat/completions. The app is
// offline-first, so the server must be on this PC: loopback hosts only.
import { modelStore } from "../store.js";

export const DEFAULT_PORT = 1234;
export const DEFAULT_EMBED_MODEL = "nomic-embed-text-v1.5";
/** The search index holds nomic-embed-text vectors; others do not compare. */
export const EMBED_DIMENSIONS = 768;
const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/i;

/**
 * The base URL for `{ url, port }`, or an error. Only http(s) on a loopback
 * host, no credentials, port 1 to 65535. "localhost" becomes 127.0.0.1 so a
 * name lookup never decides where the call goes.
 *
 * @returns {{ ok: true, base: string } | { ok: false, error: string }}
 */
export function openaiBase({ url = "http://localhost", port } = {}) {
  let u;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`);
  } catch {
    return { ok: false, error: "That is not a valid address." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "Use an http address." };
  }
  if (u.username || u.password) {
    return { ok: false, error: "Leave the user name and password out." };
  }
  if (!LOOPBACK.test(u.hostname)) {
    return {
      ok: false,
      error:
        "MindSage only talks to AI servers on this PC (localhost or 127.0.0.1).",
    };
  }
  const chosen = Number(port || u.port || DEFAULT_PORT);
  if (!Number.isInteger(chosen) || chosen < 1 || chosen > 65535) {
    return { ok: false, error: "The port must be a number from 1 to 65535." };
  }
  const host =
    u.hostname.toLowerCase() === "localhost" ? "127.0.0.1" : u.hostname;
  return { ok: true, base: `${u.protocol}//${host}:${chosen}` };
}

/** The saved settings: { url, port, model, embedModel }. */
export const settings = () => modelStore.get("openaiCompat") ?? {};

function target() {
  const s = settings();
  const b = openaiBase(s);
  if (!b.ok) throw new Error(b.error);
  return { ...s, base: b.base };
}

/** A redirect could leave the PC, so it is an error. */
export const call = (base, route, init, fetchImpl = fetch) =>
  fetchImpl(`${base}${route}`, { redirect: "error", ...init });

async function fail(res) {
  let detail = "";
  try {
    detail = (await res.json())?.error?.message ?? "";
  } catch {
    /* not JSON */
  }
  throw new Error(
    `AI server error: ${res.status} ${detail}`.trim().slice(0, 200),
  );
}

/** See client.js for the options. */
export async function generate(
  prompt,
  {
    system,
    schema,
    json = false,
    maxTokens,
    temperature,
    onToken,
    signal,
  } = {},
) {
  if (!prompt) throw new Error("A prompt is required.");
  const { base, model } = target();
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const body = { model, messages, stream: Boolean(onToken) };
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  if (temperature !== undefined) body.temperature = temperature;
  if (schema || json) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "answer",
        strict: true,
        schema: schema ?? { type: "object" },
      },
    };
  }
  const res = await call(base, "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await fail(res);
  if (!onToken) return (await res.json()).choices?.[0]?.message?.content ?? "";
  if (!res.body) throw new Error("The AI server returned no response body.");

  // Server-sent events: "data: {json}" lines, ended by "data: [DONE]".
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let full = "";
  const consume = (line) => {
    const text = line.trim();
    if (!text.startsWith("data:")) return;
    const data = text.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (parsed.error) throw new Error("AI server error");
    const fragment = parsed.choices?.[0]?.delta?.content;
    if (typeof fragment === "string" && fragment) {
      full += fragment;
      onToken(fragment, full);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      let at;
      while ((at = carry.indexOf("\n")) !== -1) {
        consume(carry.slice(0, at));
        carry = carry.slice(at + 1);
      }
    }
    consume(carry + decoder.decode());
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  return full;
}

export async function embed(text) {
  const { base, embedModel } = target();
  const res = await call(base, "/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: embedModel || DEFAULT_EMBED_MODEL,
      input: text,
    }),
  });
  if (!res.ok) await fail(res);
  return (await res.json()).data?.[0]?.embedding;
}

export const modelName = () => settings().model || "openai-compatible";

/** Whether the saved server answers, for the restart status. */
export async function reachable() {
  const b = openaiBase(settings());
  if (!b.ok) return false;
  try {
    return (
      await call(b.base, "/v1/models", { signal: AbortSignal.timeout(2000) })
    ).ok;
  } catch {
    return false;
  }
}
