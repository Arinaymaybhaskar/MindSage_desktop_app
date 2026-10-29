// The Ollama provider behind the AI client: the advanced option, for people
// who already run Ollama. Every call goes to the local Ollama on 127.0.0.1.
import { modelStore } from "../store.js";

const OLLAMA = "http://127.0.0.1:11434";

export const defaultModel = () =>
  modelStore.get("selectedModels")?.chat || "llama3.2:latest";

/**
 * One `/api/generate` call; see client.js for the options. With `onToken` the
 * answer streams as NDJSON (one JSON object per line, the next fragment in
 * `response`), read with a carry buffer because a socket chunk routinely ends
 * mid-line.
 */
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
    ollamaModel,
  } = {},
) {
  if (!prompt) throw new Error("A prompt is required.");
  const options = {};
  if (maxTokens !== undefined) options.num_predict = maxTokens;
  if (temperature !== undefined) options.temperature = temperature;
  const body = {
    model: ollamaModel || defaultModel(),
    prompt,
    stream: Boolean(onToken),
    options,
  };
  if (system) body.system = system;
  if (schema) body.format = schema;
  else if (json) body.format = "json";

  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`);
  }
  if (!onToken) return (await res.json()).response;
  if (!res.body) throw new Error("Ollama returned no response body.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let full = "";

  /** Handles one complete NDJSON line. */
  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // A malformed line is not worth aborting a whole generation over.
      return;
    }
    if (parsed.error) throw new Error(`Ollama error: ${parsed.error}`);
    if (typeof parsed.response === "string" && parsed.response.length > 0) {
      full += parsed.response;
      onToken(parsed.response, full);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });

      let newlineAt;
      while ((newlineAt = carry.indexOf("\n")) !== -1) {
        consumeLine(carry.slice(0, newlineAt));
        carry = carry.slice(newlineAt + 1);
      }
    }
    // The final line may arrive without a trailing newline.
    consumeLine(carry + decoder.decode());
  } finally {
    // Releasing matters on the abort path: an unreleased reader keeps the
    // socket open and the model loaded.
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  return full;
}

export async function embed(text) {
  const res = await fetch(`${OLLAMA}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text:v1.5", prompt: text }),
  });
  if (!res.ok) {
    throw new Error(
      `Ollama embedding API error: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()).embedding;
}
