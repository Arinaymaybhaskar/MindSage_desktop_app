// RoBERTa's byte-level BPE, read from a Hugging Face tokenizer.json (KAN-388):
// the input the feelings classifier and the summary check take. Both models
// share the RoBERTa vocabulary. Pure: no electron, no fs.

// GPT-2's pre-tokenizer, which RoBERTa's ByteLevel step uses (use_regex).
const PIECES =
  /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/** GPT-2's map from each byte to a printable character, as the vocab spells it. */
function byteChars() {
  const bytes = [];
  for (let b = 33; b <= 126; b++) bytes.push(b);
  for (let b = 161; b <= 172; b++) bytes.push(b);
  for (let b = 174; b <= 255; b++) bytes.push(b);
  const codes = [...bytes];
  let extra = 0;
  for (let b = 0; b < 256; b++) {
    if (!bytes.includes(b)) {
      bytes.push(b);
      codes.push(256 + extra++);
    }
  }
  const map = new Array(256);
  bytes.forEach((b, i) => (map[b] = String.fromCharCode(codes[i])));
  return map;
}

/**
 * @param {{ model: { vocab: Record<string, number>, merges: (string|string[])[] },
 *   added_tokens: { id: number, content: string }[] }} json  a tokenizer.json
 */
export function createTokenizer(json) {
  const { vocab, merges } = json.model;
  const ranks = new Map(
    merges.map((m, i) => [Array.isArray(m) ? m.join(" ") : m, i]),
  );
  const special = Object.fromEntries(
    json.added_tokens.map((t) => [t.content, t.id]),
  );
  const chars = byteChars();
  const utf8 = new TextEncoder();
  const unk = special["<unk>"];
  const cache = new Map();

  /** Merges the lowest-ranked pair, everywhere it occurs, until none is left. */
  function bpe(word) {
    let parts = [...word];
    for (;;) {
      let best = -1;
      let bestRank = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const rank = ranks.get(`${parts[i]} ${parts[i + 1]}`);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          best = i;
        }
      }
      if (best < 0) return parts;
      const [a, b] = [parts[best], parts[best + 1]];
      const next = [];
      for (let i = 0; i < parts.length;) {
        if (parts[i] === a && parts[i + 1] === b) {
          next.push(a + b);
          i += 2;
        } else next.push(parts[i++]);
      }
      parts = next;
    }
  }

  /** Token ids for `text`, without <s> and </s>. */
  function encode(text) {
    const ids = [];
    for (const piece of String(text).match(PIECES) ?? []) {
      const word = Array.from(utf8.encode(piece), (b) => chars[b]).join("");
      let tokens = cache.get(word);
      if (!tokens) {
        tokens = bpe(word).map((t) => vocab[t] ?? unk);
        if (cache.size < 50_000) cache.set(word, tokens);
      }
      ids.push(...tokens);
    }
    return ids;
  }

  return {
    encode,
    bos: special["<s>"],
    eos: special["</s>"],
    pad: special["<pad>"],
  };
}
