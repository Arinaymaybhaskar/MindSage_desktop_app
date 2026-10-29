// The CPU ONNX runtime (KAN-388): the feelings classifier that runs first on
// save and the entailment gate a summary passes before it is saved. Neither
// needs Ollama or the llama engine, only its downloaded model and the shared
// tokenizer. onnxruntime-node is imported on first use, so startup and the
// unit tests never load it. Nothing here logs entry or summary text.
import fs from "node:fs";
import os from "node:os";
import { log } from "../log.js";
import { isDownloaded, modelPath } from "./llama.js";
import { ONNX_MODELS } from "./models.js";
import { createTokenizer } from "./bpe.js";
import {
  CLASSIFY_MAX_WINDOWS,
  CLASSIFY_WINDOW,
  ENTAILMENT_MIN,
  PREMISE_MAX_WINDOWS,
  PREMISE_STRIDE,
  PREMISE_WINDOW,
  entailment,
  feelingsFromLogits,
  pairIds,
  summarySentences,
  windows,
} from "./classify.js";

/** Half the cores: the classifier runs while the user may still be typing. */
const THREADS = Math.max(1, Math.floor(os.availableParallelism() / 2));
const BATCH = 8;

let ort = null;
let tokenizer = null;
const sessions = new Map(); // model id -> Promise<InferenceSession>

const ready = (id) => isDownloaded(id) && isDownloaded(ONNX_MODELS.tokenizer);
export const classifierReady = () => ready(ONNX_MODELS.classifier);
export const summaryCheckReady = () => ready(ONNX_MODELS.nli);

function tok() {
  tokenizer ??= createTokenizer(
    JSON.parse(fs.readFileSync(modelPath(ONNX_MODELS.tokenizer), "utf8")),
  );
  return tokenizer;
}

async function session(id) {
  ort ??= await import("onnxruntime-node");
  if (!sessions.has(id)) {
    const opening = ort.InferenceSession.create(modelPath(id), {
      executionProviders: ["cpu"],
      intraOpNumThreads: THREADS,
    });
    opening.catch(() => sessions.delete(id));
    sessions.set(id, opening);
  }
  return sessions.get(id);
}

/** Logits, one row per input row of token ids (padded into batches). */
async function run(id, rows) {
  const s = await session(id);
  const out = [];
  for (let at = 0; at < rows.length; at += BATCH) {
    const batch = rows.slice(at, at + BATCH);
    const width = Math.max(...batch.map((r) => r.length));
    const size = batch.length * width;
    const ids = new BigInt64Array(size).fill(BigInt(tok().pad));
    const mask = new BigInt64Array(size);
    batch.forEach((r, i) =>
      r.forEach((t, j) => {
        ids[i * width + j] = BigInt(t);
        mask[i * width + j] = 1n;
      }),
    );
    const dims = [batch.length, width];
    const feeds = {
      input_ids: new ort.Tensor("int64", ids, dims),
      attention_mask: new ort.Tensor("int64", mask, dims),
    };
    if (s.inputNames.includes("token_type_ids"))
      feeds.token_type_ids = new ort.Tensor(
        "int64",
        new BigInt64Array(size),
        dims,
      );
    const logits = (await s.run(feeds))[s.outputNames[0]];
    const labels = logits.dims[1];
    for (let i = 0; i < batch.length; i++)
      out.push(Array.from(logits.data.slice(i * labels, (i + 1) * labels)));
  }
  return out;
}

/**
 * Feeling words for an entry from the classifier, or null when it is not
 * downloaded or failed (the chat model's tags are used then).
 */
export async function classifyFeelings(text) {
  if (!classifierReady()) return null;
  try {
    const { encode, bos, eos } = tok();
    const rows = windows(encode(text), CLASSIFY_WINDOW)
      .slice(0, CLASSIFY_MAX_WINDOWS)
      .map((w) => [bos, ...w, eos]);
    return feelingsFromLogits(await run(ONNX_MODELS.classifier, rows));
  } catch (err) {
    log.warn("Feelings classifier failed", { error: err.message });
    return null;
  }
}

/**
 * The entailment gate: true when every sentence of the summary follows from
 * some part of the entry, false when one does not, null when it cannot be
 * checked (model not downloaded, failed, or the entry is too long to read
 * whole), in which case the summary is saved as before.
 */
export async function summarySupported(entryText, summary) {
  if (!summaryCheckReady()) return null;
  try {
    const t = tok();
    const ids = t.encode(entryText);
    const premises = windows(ids, PREMISE_WINDOW, PREMISE_STRIDE);
    if (premises.length > PREMISE_MAX_WINDOWS) return null;
    for (const sentence of summarySentences(summary)) {
      const hypothesis = t.encode(sentence);
      const rows = premises.map((p) => pairIds(p, hypothesis, t));
      const scores = (await run(ONNX_MODELS.nli, rows)).map(entailment);
      if (Math.max(...scores) < ENTAILMENT_MIN) return false;
    }
    return true;
  } catch (err) {
    log.warn("Summary check failed", { error: err.message });
    return null;
  }
}
