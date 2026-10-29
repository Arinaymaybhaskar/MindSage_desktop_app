// What the model picker shows: the per-task recommendation from memory, and
// size, memory and speed bars per chat model. Pure (no electron, no fs), so
// the choices are unit-tested.
import {
  BUILTIN_MODELS,
  TASK_MODELS,
  defaultChatModel,
  fitsInMemory,
} from "./models.js";

const GiB = 2 ** 30;
/** Weights plus context and buffers, as fitsInMemory assumes. */
const MEMORY_FACTOR = 1.3;
/** Never recommended; offered only when the user asks for it. */
export const ON_REQUEST = ["llama-3.1-8b"];

/**
 * Which model does which task on a machine with this much memory.
 * `metadata` (mood, tags) is null under 8 GB: Qwen 2.5 1.5B is kept off mood
 * (it gets feeling direction right 44%), so there summaries are its only job.
 * TODO(KAN-388): when the GoEmotions classifier exists, `feelings` becomes
 * "classifier" and reads the mood; until then nothing fills it on small PCs.
 */
export function recommend(totalMemBytes) {
  const small = totalMemBytes < 10 * GiB; // "8 GB" PCs report just under 8 GiB
  return {
    chat: defaultChatModel(totalMemBytes),
    metadata: small ? null : TASK_MODELS.metadata,
    summary: TASK_MODELS.summary,
    feelings: small ? "classifier" : "chat-model",
  };
}

/** "2.0 GB": sizes are shown in GB with one decimal everywhere. */
export const formatGB = (bytes) => `${(bytes / GiB).toFixed(1)} GB`;

/**
 * What the download dialog needs about disk: a cut download only needs the
 * rest of the file, plus room to unpack an engine. `short` is how much must
 * still be freed, 0 when it fits.
 */
export function downloadSpace(id, freeBytes, partialBytes = 0) {
  const spec = BUILTIN_MODELS[id];
  const need =
    Math.max(0, spec.bytes - partialBytes) + (spec.unpackedBytes ?? 0);
  return { need, free: freeBytes, short: Math.max(0, need - freeBytes) };
}

/**
 * What deleting a model takes away. The embedding model is search itself, so
 * it has no stand-in; a chat model falls back to another downloaded chat
 * model, else chat is off until one is downloaded.
 */
export function deleteImpact(id, selectedChat, isDownloaded) {
  const embed = BUILTIN_MODELS[id].role === "embed";
  if (!isDownloaded(id) || (!embed && id !== selectedChat))
    return { inUse: false };
  const alternative = embed
    ? null
    : (Object.keys(BUILTIN_MODELS).find(
        (m) => m !== id && BUILTIN_MODELS[m].role === "chat" && isDownloaded(m),
      ) ?? null);
  const label = BUILTIN_MODELS[id].label;
  const warning = embed
    ? `${label} powers search. Search stops working until it is downloaded again.`
    : alternative
      ? `${label} is the chat model in use. ${BUILTIN_MODELS[alternative].label} takes over.`
      : `${label} is the chat model in use and no other is downloaded. AI features turn off until you download one.`;
  return { inUse: true, alternative, warning };
}

/** A file another program holds open cannot be deleted now; try again later. */
export const isLockedError = (err) =>
  ["EBUSY", "EPERM", "EACCES"].includes(err?.code);

/** Said before a download starts when the model will not run here, else null. */
export function downloadWarning(id, totalMemBytes) {
  const spec = BUILTIN_MODELS[id];
  if (!spec || fitsInMemory(spec.bytes, totalMemBytes)) return null;
  return `${spec.label} needs about ${formatGB(spec.bytes * MEMORY_FACTOR)} of memory and would not run well on this PC.`;
}

/**
 * One row per chat model. Bars are shares from 0 to 1. `probe` is
 * { id, tokensPerSecond } from the 5-second speed test, or null when it failed
 * or has not run: then speed is null (bars hidden) and only memory is used.
 * Models the probe did not run are scaled from the one it did (speed falls
 * with size) and marked `speedMeasured: false`.
 */
export function modelBars(totalMemBytes, probe, isDownloaded = () => false) {
  const chats = Object.entries(BUILTIN_MODELS).filter(
    ([, s]) => s.role === "chat",
  );
  const probed = probe && BUILTIN_MODELS[probe.id];
  const usable = probed && probe.tokensPerSecond > 0;
  const speeds = chats.map(([id, spec]) => {
    if (!usable) return null;
    return id === probe.id
      ? probe.tokensPerSecond
      : (probe.tokensPerSecond * probed.bytes) / spec.bytes;
  });
  const maxBytes = Math.max(...chats.map(([, s]) => s.bytes));
  const maxSpeed = Math.max(0, ...speeds.map((s) => s ?? 0));
  const rec = recommend(totalMemBytes);
  return chats.map(([id, spec], i) => {
    const memoryBytes = Math.round(spec.bytes * MEMORY_FACTOR);
    return {
      id,
      label: spec.label,
      bytes: spec.bytes,
      sizeShare: spec.bytes / maxBytes,
      memoryBytes,
      memoryShare: Math.min(1, memoryBytes / totalMemBytes),
      tokensPerSecond: speeds[i],
      speedShare: speeds[i] === null ? null : speeds[i] / maxSpeed,
      speedMeasured: usable && id === probe.id,
      downloaded: isDownloaded(id),
      fits: fitsInMemory(spec.bytes, totalMemBytes),
      warning: downloadWarning(id, totalMemBytes),
      onRequest: ON_REQUEST.includes(id),
      recommendedFor: Object.entries(rec)
        .filter(([task, m]) => task !== "feelings" && m === id)
        .map(([task]) => task),
    };
  });
}
