// What the ONNX models' numbers mean (KAN-388): GoEmotions labels as MindSage
// feeling words, and when a summary counts as supported by its entry. Pure:
// no electron, no onnxruntime, so the choices are unit-tested.
//
// The thresholds are a first setting, not measured on MindSage's bench sets;
// tune them there before relying on the gate.

/** Each GoEmotions label (the classifier's outputs, in order) as a feeling word. */
export const GOEMOTIONS = [
  ["admiration", "Interested"],
  ["amusement", "Playful"],
  ["anger", "Mad"],
  ["annoyance", "Frustrated"],
  ["approval", "Accepted"],
  ["caring", "Trusting"],
  ["confusion", "Confused"],
  ["curiosity", "Interested"],
  ["desire", "Excited"],
  ["disappointment", "Disappointed"],
  ["disapproval", "Disapproving"],
  ["disgust", "Repelled"],
  ["embarrassment", "Humiliated"],
  ["excitement", "Excited"],
  ["fear", "Scared"],
  ["gratitude", "Content"],
  ["grief", "Despair"],
  ["joy", "Content"],
  ["love", "Accepted"],
  ["nervousness", "Anxious"],
  ["optimism", "Optimistic"],
  ["pride", "Proud"],
  ["realization", null], // no feeling of its own
  ["relief", "Peaceful"],
  ["remorse", "Guilty"],
  ["sadness", "Hurt"],
  ["surprise", "Startled"],
  ["neutral", null],
];

/** A label at or above this probability (sigmoid; labels are independent) counts. */
export const FEELING_MIN = 0.35;
export const MAX_FEELINGS = 5;
/** The classifier reads the entry this many tokens at a time, at most this many times. */
export const CLASSIFY_WINDOW = 126;
export const CLASSIFY_MAX_WINDOWS = 16;

/** A summary sentence is supported when some part of the entry entails it this strongly. */
export const ENTAILMENT_MIN = 0.5;
/** The NLI model's label order (its config.json id2label). */
export const NLI_LABELS = ["contradiction", "entailment", "neutral"];
/** Premise windows: the model holds 512 tokens, the summary sentence takes the rest. */
export const PREMISE_WINDOW = 384;
export const PREMISE_STRIDE = 256;
/** A longer entry is not checked: the gate would judge only its start. */
export const PREMISE_MAX_WINDOWS = 12;
export const PAIR_MAX = 512;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function softmax(logits) {
  const top = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - top));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Splits token ids into windows of `size`, moving `stride` at a time. */
export function windows(ids, size, stride = size) {
  const out = [];
  for (let start = 0; ; start += stride) {
    out.push(ids.slice(start, start + size));
    if (start + size >= ids.length) return out;
  }
}

/**
 * Feeling words from the classifier's logits, one row per window: a label
 * counts when any window reaches FEELING_MIN; strongest first, no repeats.
 * @param {number[][]} rows
 */
export function feelingsFromLogits(rows) {
  const best = GOEMOTIONS.map((_, i) =>
    Math.max(...rows.map((r) => sigmoid(r[i]))),
  );
  const words = [];
  for (const i of best.map((_, i) => i).sort((a, b) => best[b] - best[a])) {
    const word = GOEMOTIONS[i][1];
    if (best[i] < FEELING_MIN) break;
    if (word && !words.includes(word)) words.push(word);
    if (words.length === MAX_FEELINGS) break;
  }
  return words;
}

/** The summary's sentences, as the gate checks them one by one. */
export const summarySentences = (summary) =>
  String(summary)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** P(entailment) from one row of NLI logits. */
export const entailment = (logits) =>
  softmax(logits)[NLI_LABELS.indexOf("entailment")];

/**
 * RoBERTa's pair input, `<s> A </s></s> B </s>`, cutting the longer side
 * first until it fits `max`.
 */
export function pairIds(a, b, { bos, eos }, max = PAIR_MAX) {
  a = [...a];
  b = [...b];
  while (a.length + b.length + 4 > max) (a.length >= b.length ? a : b).pop();
  return [bos, ...a, eos, eos, ...b, eos];
}
