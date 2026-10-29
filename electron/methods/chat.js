import localDB from "../db/index.js";
import { eventBus } from "../eventBus.js";
import {
  ASK_ANSWER_MAX_TOKENS,
  ASK_INTENTS,
  HISTORY_MESSAGES,
  MAX_OUTPUT_TOKENS,
  askPlanPrompt,
  trimHistory,
  respondWithContext,
  respondWithoutContext,
} from "./AIPrompts.js";
import { generate } from "../ai/client.js";
import { foreground } from "../ai/queue.js";
import { partialJsonString } from "./jsonStream.js";
import { localDay, runTool } from "./askTools.js";
import { isIndexUnavailable } from "../services/searchIndex.js";
import z from "zod";
import { currentUserId } from "../session.js";
import { log } from "../log.js";

// Router mode (KAN-447): the planning call picks one intent and its
// arguments, code runs exactly one read tool, the answer call writes the reply.
const planSchema = z.object({
  intent: z.enum(ASK_INTENTS),
  arguments: z.record(z.unknown()).nullish(),
  unchecked: z.string().nullish(),
});

/** Which tool each intent runs, and the plan arguments it takes. */
const ROUTES = {
  search: [
    "search_entries",
    ["query", "from", "to", "mood_min", "mood_max", "feelings", "limit"],
  ],
  date_range: ["get_entries_by_date", ["from", "to", "order", "limit"]],
  mood_stats: ["mood_stats", ["from", "to", "group_by"]],
  // shortcut: counting needs its own tool (KAN-143, a later phase); until
  // then a count question searches.
  count: ["search_entries", ["query", "from", "to"]],
  goals: ["get_goals", ["status", "category"]],
};

/** What a plan that failed or timed out turns into: search the question. */
const SEARCH_INSTEAD = { intent: "search", arguments: {}, unchecked: "" };
export const PLAN_TIMEOUT_MS = 60_000;

const chatResponseSchema = z.object({
  response: z.string(),
  suggested_user_prompt: z.string(),
});

// The same two shapes as JSON schemas, forced on the model as a grammar.
const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ASK_INTENTS },
    arguments: {
      type: "object",
      properties: {
        query: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        mood_min: { type: "integer" },
        mood_max: { type: "integer" },
        feelings: { type: "array", items: { type: "string" } },
        limit: { type: "integer" },
        order: { type: "string", enum: ["newest", "oldest"] },
        group_by: {
          type: "string",
          enum: ["day", "week", "month", "weekday", "feeling"],
        },
        status: { type: "string", enum: ["active", "completed", "all"] },
        category: { type: "string" },
      },
    },
    unchecked: { type: "string" },
  },
  required: ["intent", "arguments", "unchecked"],
};
const CHAT_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    response: { type: "string" },
    suggested_user_prompt: { type: "string" },
  },
  required: ["response", "suggested_user_prompt"],
};

/**
 * Sends generation progress to the window that asked for it.
 *
 * Returns a no-op when the caller did not supply a streamId, which keeps every
 * other caller of handleUserMessage working unchanged.
 */
function makeStreamEmitter(event, streamId) {
  if (!streamId || !event?.sender) return () => {};
  return (type, payload = {}) => {
    // The window can be closed or reloaded mid-generation. Sending to a
    // destroyed WebContents throws, which would abort a run that is
    // otherwise still worth finishing and storing.
    if (event.sender.isDestroyed()) return;
    try {
      event.sender.send("chat:stream", { streamId, type, ...payload });
    } catch (err) {
      log.warn("[chat:stream] failed to emit", type, err.message);
    }
  };
}

// Helper: parse and retry AI JSON
async function parseAIWithRetries(rawFn, schema, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.debug("calling ai");
      const raw = await rawFn(attempt);
      log.debug("ai response", { chars: raw?.length });
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");

      return schema.parse(JSON.parse(jsonMatch[0]));
    } catch (err) {
      log.warn(`AI attempt ${attempt} failed`, { reason: err?.name });
      if (attempt === maxRetries)
        throw new Error(`Failed after ${maxRetries} attempts`);
    }
  }
}

/** The profile changed while Ask was answering (KAN-454). */
class ProfileChangedError extends Error {
  code = "profile-changed";
  constructor() {
    super("The profile changed before the answer finished.");
  }
}

/**
 * The planning call. Never throws for a bad or slow plan: a timeout, an
 * unreadable answer or an unknown intent searches the question instead.
 */
async function planQuestion(content, history, model, signal) {
  const prompt = askPlanPrompt(content, {
    today: localDay(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    history,
  });
  const timeout = AbortSignal.timeout(PLAN_TIMEOUT_MS);
  try {
    const raw = await generate(prompt, {
      schema: PLAN_JSON_SCHEMA,
      ollamaModel: model,
      maxTokens: MAX_OUTPUT_TOKENS,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const json = String(raw ?? "").match(/\{[\s\S]*\}/);
    if (!json) throw new SyntaxError("No JSON found");
    return planSchema.parse(JSON.parse(json[0]));
  } catch (error) {
    if (signal?.aborted) throw new ProfileChangedError();
    log.warn("Ask plan failed; searching the question", {
      reason: error?.name,
    });
    return SEARCH_INSTEAD;
  }
}

/**
 * Runs the plan's one tool. Arguments the tool's schema refuses fall back to
 * searching the question text.
 */
async function lookUp(plan, content) {
  const [name, keys] = ROUTES[plan.intent];
  const args = Object.fromEntries(
    keys
      .map((key) => [key, plan.arguments?.[key]])
      .filter(([, value]) => value != null && value !== ""),
  );
  const result = await runTool(name, args);
  if (result.ok) return result;
  log.info("Ask tool refused its arguments; searching the question", {
    tool: name,
  });
  return runTool("search_entries", { query: content });
}

async function aiResponse(content, chatId, messageId, model, hooks = {}) {
  const {
    onPhase = () => {},
    onDelta = () => {},
    onReset = () => {},
    signal,
    userId: askedBy,
    history = [],
  } = hooks;
  // Every tool reads the session; once the profile that asked is gone, the
  // next step stops instead of reading for, or showing to, another profile.
  const stillAsker = () => {
    if (signal?.aborted || currentUserId() !== askedBy) {
      throw new ProfileChangedError();
    }
    return askedBy;
  };
  try {
    log.debug("aiResponse called", {
      chatId,
      messageId,
      model,
      contentChars: content?.length,
    });
    // 1️⃣ Plan: one intent and its arguments.
    onPhase("thinking");
    const plan = await planQuestion(content, history, model, signal);
    log.debug("Ask plan", { intent: plan.intent });

    // 2️⃣ Run exactly one read tool; intent "none" answers without the journal.
    let found = null;
    if (plan.intent !== "none") {
      onPhase("searching");
      stillAsker();
      found = await lookUp(plan, content);
      stillAsker();
    }
    const sources = found?.ok ? found.sources : [];
    // The shape the renderer and storeAIResponse read.
    const semanticResult = sources.map((s) => ({
      id: s.source_id,
      payload: {
        source_type: s.source_type,
        source_id: s.source_id,
        title: s.source_title,
      },
    }));
    // Shown above the answer: which tool ran and over what.
    const lead = found?.ok ? `${found.summary}\n\n` : "";
    const mainPrompt = found?.ok
      ? respondWithContext(content, found.text, history, plan.unchecked ?? "")
      : respondWithoutContext(content, history);

    // 3️⃣ Get final chat response, streaming it to the renderer as it forms.
    stillAsker();
    onPhase("writing", { sources: semanticResult });
    const chatResponse = await parseAIWithRetries(
      (attempt) => {
        // A failed attempt may already have streamed a partial answer.
        // Tell the renderer to throw it away before the retry starts,
        // otherwise the second attempt appends to the first.
        onReset();
        if (lead) onDelta(lead);
        let emitted = 0;
        return generate(mainPrompt, {
          schema: CHAT_RESPONSE_JSON_SCHEMA,
          ollamaModel: model,
          maxTokens: ASK_ANSWER_MAX_TOKENS * attempt,
          signal,
          onToken: (_fragment, full) => {
            if (signal?.aborted) return;
            const partial = partialJsonString(full, "response");
            if (partial === null || partial.length <= emitted) return;
            onDelta(partial.slice(emitted));
            emitted = partial.length;
          },
        });
      },
      chatResponseSchema,
      3,
    );
    log.debug("ai chat response ready", {
      chars: JSON.stringify(chatResponse ?? "").length,
    });
    stillAsker();
    chatResponse.response = lead + chatResponse.response;
    return { chatResponse, chatId, messageId, semanticResult };
  } catch (error) {
    // The caller tells the renderer this one in plain words; every other
    // failure keeps the old swallow-and-report behaviour.
    if (isIndexUnavailable(error)) throw error;
    // An aborted call fails with the provider's own error; the signal says why.
    if (signal?.aborted || error instanceof ProfileChangedError) {
      throw new ProfileChangedError();
    }
    log.error("Ask failed", error);
    eventBus.emit("chat:error", error);
  }
}

async function storeAIResponse(aiRes, chatId) {
  try {
    if (!aiRes || !aiRes.chatResponse) {
      log.warn("[storeAIResponse] No AI response found to store.");
      return null;
    }

    const { chatResponse, semanticResult } = aiRes;
    // The schema/prompt produce `suggested_user_prompt`, not
    // `follow_up_question`; read the correct key so the follow-up is
    // actually stored with the message.
    const { response, suggested_user_prompt } = chatResponse;

    // Combine response and follow-up prompt (if present)
    let finalContent = response;
    if (suggested_user_prompt) {
      finalContent += `\n\nFollow-up: ${suggested_user_prompt}`;
    }

    // Extract relevant sources from semanticResult payload
    const sources = (semanticResult || [])
      .filter((s) => s.payload && s.payload.source_type && s.payload.source_id)
      .map((s) => ({
        source_type: s.payload.source_type,
        source_id: String(s.payload.source_id),
        source_title: String(s.payload.title),
      }));

    // Store AI message
    const aiMessage = await localDB.addMessage(
      chatId,
      "ai",
      finalContent,
      sources,
      [],
    );
    const aiMessageId = aiMessage?.id ?? null;

    log.info("[storeAIResponse] Stored AI message:", {
      chatId,
      aiMessageId,
      sourcesCount: sources.length,
    });

    return {
      aiMessageId,
      content: finalContent,
      followUp: suggested_user_prompt || null,
    };
  } catch (error) {
    log.error("[storeAIResponse] Error:", error);
    log.error("Params:", { chatId, aiRes });
    throw error;
  }
}

export const handleUserMessage = async (
  event,
  chatId,
  message,
  model,
  sources = [],
  files = [],
  streamId = null,
) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  const emit = makeStreamEmitter(event, streamId);
  // The chat id comes from the renderer: never add to another profile's chat.
  if (chatId && !(await localDB.isOwnChat(userId, chatId))) {
    return { error: "Chat not found" };
  }
  // Read before the new question is saved, from the chat it was asked in, so
  // a chat switch mid-answer cannot change it (KAN-444).
  const history = chatId
    ? trimHistory(localDB.recentMessages(userId, chatId, HISTORY_MESSAGES))
    : [];
  if (!chatId) {
    const title = message.length < 20 ? message : "chat";
    const newChat = await localDB.AddChat(userId, { title, model });
    chatId = newChat.id;
  }

  // Add the user's message
  const userMessage = await localDB.addMessage(
    chatId,
    "user",
    message,
    sources,
    files,
  );
  const messageId = userMessage.id;
  // eventBus.emit("chat:new-message", { content: message, chatId, messageId, model, userId });
  log.debug("aiResponse called", {
    chatId,
    messageId,
    model,
    userId,
    contentChars: message?.length,
  });

  // The chat id is only known here once a new chat has been created, and
  // the renderer needs it before the reply finishes so a mid-generation
  // chat switch can tell whose stream it is watching.
  emit("start", { chatId, messageId });

  // Signing out or switching profile stops the answer and drops its results.
  const stop = new AbortController();
  const onSession = () => {
    if (currentUserId() !== userId) stop.abort();
  };
  eventBus.on("session:changed", onSession);
  let aiRes;
  try {
    // Ask goes ahead of background AI work in the shared queue.
    aiRes = await foreground(() =>
      aiResponse(message, chatId, messageId, model, {
        userId,
        history,
        signal: stop.signal,
        onPhase: (phase, extra) => emit("phase", { phase, ...extra }),
        onDelta: (text) => emit("delta", { text }),
        onReset: () => emit("reset"),
      }),
    );
  } catch (err) {
    emit("error", { message: err?.message || "Generation failed." });
    if (isIndexUnavailable(err) || err instanceof ProfileChangedError)
      return { error: err.message, code: err.code, chatId, messageId };
    throw err;
  } finally {
    eventBus.off("session:changed", onSession);
  }

  // aiResponse swallows its own errors and returns undefined, so an empty
  // result is a failure the renderer still has to be told about - without
  // this it would sit on a half-streamed bubble forever.
  if (!aiRes || !aiRes.chatResponse) {
    emit("error", { message: "The model did not return a usable answer." });
    return {
      error: "The model did not return a usable answer.",
      chatId,
      messageId,
    };
  }

  // Store AI response in DB
  const stored = await storeAIResponse(aiRes, chatId);
  const aiMessageId = stored?.aiMessageId ?? null;
  emit("done", { aiMessageId });

  // `messageId` is the id of the user's own message. The renderer
  // destructures it to swap its optimistic id for the real one and gates
  // image/PDF upload on it - omitting it left that gate permanently
  // closed, so attachments silently never uploaded.
  return { chatId, messageId, aiMessageId, aiRes };
};

export const handleGetChats = async (event, page, limit) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  const offset = (page - 1) * limit;
  return localDB.getChatsTitlesByUsers(userId, limit, offset);
};

export const handleGetChatById = (event, chatId) => {
  const userId = currentUserId();
  if (!userId) {
    return Promise.resolve({
      error: "Not signed in",
    });
  }

  return localDB.getChatById(userId, chatId);
};

export const handleDeleteChat = async (event, chatId) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.deleteChat(userId, chatId);
};

export const handleChangeChatTitle = async (event, chatId, newTitle) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.changeChatTitle(userId, chatId, newTitle);
};

export const linkMediaToMessage = async (
  event,
  messageId,
  chatId,
  imageKey,
) => {
  log.info("linkMediaToMessage called with in method file:", {
    messageId,
    chatId,
    imageKey,
  });
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  try {
    const lower = String(imageKey).toLowerCase();
    let fileType = "image";
    if (lower.endsWith(".pdf")) fileType = "pdf";
    else if (
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".gif") ||
      lower.endsWith(".webp")
    )
      fileType = "image";
    // Store with inferred type
    return localDB.linkMediaToMessage(messageId, chatId, imageKey, fileType);
  } catch (err) {
    log.error("Failed to infer file type for media link:", err);
    return localDB.linkMediaToMessage(messageId, chatId, imageKey, "image");
  }
};
