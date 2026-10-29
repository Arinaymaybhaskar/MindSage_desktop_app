// Embeds text no longer than the embedding model holds, for the indexer and
// for search and Ask queries alike (KAN-391, KAN-439).

/** About the 2048 tokens nomic-embed-text holds, for English text. */
export const MAX_EMBED_CHARS = 8000;
/** Always fits 2048 tokens: its tokenizer never makes more tokens than characters. */
export const MIN_EMBED_CHARS = 2000;

/** Ollama or the built-in engine cannot embed right now: not the item's fault. */
export function isUnavailable(error) {
  if (error?.code === "AI_UNAVAILABLE") return true;
  const text = `${error?.message ?? ""} ${error?.cause?.code ?? ""}`;
  return /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket|\b404\b|\b503\b/i.test(
    text,
  );
}

/**
 * The embedding of the start of `text` that fits the model's context, or null
 * for blank text, which the model returns no vector for.
 *
 * @param {(text: string) => Promise<number[]>} embed
 * @param {string} text
 */
export async function embedFitting(embed, text) {
  if (!text.trim()) return null;
  let part = text.slice(0, MAX_EMBED_CHARS);
  for (;;) {
    try {
      return await embed(part);
    } catch (error) {
      // Too long for the context (Ollama answers 500): try a shorter start.
      if (isUnavailable(error) || part.length <= MIN_EMBED_CHARS) throw error;
      part = part.slice(0, Math.max(MIN_EMBED_CHARS, part.length >> 1));
    }
  }
}
