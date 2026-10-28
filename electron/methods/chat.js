import localDB from "../db/index.js";
import { eventBus } from "../eventBus.js";
import {
  MAX_OUTPUT_TOKENS,
  generateContextTimeAndBaseQueryPrompt,
  respondWithContext,
  respondWithoutContext,
} from "./AIPrompts.js";
import { embed, generate } from "../ai/client.js";
import { embedFitting } from "../ai/embedFitting.js";
import { foreground } from "../ai/queue.js";
import { partialJsonString } from "./jsonStream.js";
import { semanticSearch } from "./search.js";
import { isIndexUnavailable } from "../services/searchIndex.js";
import z from "zod";
import { currentUserId } from "../session.js";
import { log } from "../log.js";

// Schemas
// Be lenient about optional-ish fields: small local models routinely omit
// `notes` or send null time filters. Only requires_context is truly required;
// everything else has a sane fallback so a missing field doesn't fail parsing
// (and blow up the whole chat after 3 retries).
const propsResSchema = z.object({
  requires_context: z.boolean(),
  requires_time_filter: z.boolean().optional().default(false),
  time_filter_from: z.string().nullish().default(null),
  time_filter_to: z.string().nullish().default(null),
  base_query: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

const chatResponseSchema = z.object({
  response: z.string(),
  suggested_user_prompt: z.string(),
});

// The same two shapes as JSON schemas, forced on the model as a grammar.
const PROPS_JSON_SCHEMA = {
  type: "object",
  properties: {
    requires_context: { type: "boolean" },
    requires_time_filter: { type: "boolean" },
    time_filter_from: { type: ["string", "null"] },
    time_filter_to: { type: ["string", "null"] },
    base_query: { type: "string" },
    notes: { type: "string" },
  },
  required: [
    "requires_context",
    "requires_time_filter",
    "time_filter_from",
    "time_filter_to",
    "base_query",
    "notes",
  ],
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
      const raw = await rawFn();
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

async function aiResponse(
  content,
  chatId,
  messageId,
  model,
  userId,
  hooks = {},
) {
  const { onPhase = () => {}, onDelta = () => {}, onReset = () => {} } = hooks;
  try {
    log.debug("aiResponse called", {
      chatId,
      messageId,
      model,
      userId,
      contentChars: content?.length,
    });
    const now = new Date();
    const currentTimeISO = now.toISOString();

    // 1️⃣ Generate propsRes
    onPhase("thinking");
    const queryPropsPrompt = generateContextTimeAndBaseQueryPrompt(
      content,
      currentTimeISO,
    );
    const propsRes = await parseAIWithRetries(
      () =>
        generate(queryPropsPrompt, {
          schema: PROPS_JSON_SCHEMA,
          ollamaModel: model,
          maxTokens: MAX_OUTPUT_TOKENS,
        }),
      propsResSchema,
      3,
    );
    log.debug("Validated propsRes", {
      requiresContext: propsRes.requires_context,
      requiresTimeFilter: propsRes.requires_time_filter,
    });

    let semanticResult = [];

    // 2️⃣ Semantic search logic
    if (propsRes.requires_context) {
      // Use original user content
      log.debug("requires context");
      onPhase("searching");
      const vector = await embedFitting(embed, content);
      if (vector) semanticResult = semanticSearch(vector, userId, 5);
    } else if (propsRes.requires_time_filter) {
      log.debug("requires context with time filter");
      onPhase("searching");
      // Use base_query and time filter
      // A blank base_query (the model's choice) searches with the question.
      const vector = await embedFitting(
        embed,
        propsRes.base_query.trim() || content,
      );
      if (vector) {
        semanticResult = semanticSearch(vector, userId, 5, {
          range: {
            from: propsRes.time_filter_from,
            to: propsRes.time_filter_to,
          },
        });
      }
    }
    log.debug("Semantic result", { count: semanticResult.length });
    let mainPrompt;

    if (!propsRes.requires_context && semanticResult.length == 0) {
      log.debug("No context needed");
      mainPrompt = respondWithoutContext(content);
    } else {
      // 3️⃣ Generate prompt for main AI response
      mainPrompt = respondWithContext(content, semanticResult);
    }

    // 4️⃣ Get final chat response, streaming it to the renderer as it forms.
    onPhase("writing", { sources: semanticResult });
    const chatResponse = await parseAIWithRetries(
      () => {
        // A failed attempt may already have streamed a partial answer.
        // Tell the renderer to throw it away before the retry starts,
        // otherwise the second attempt appends to the first.
        onReset();
        let emitted = 0;
        return generate(mainPrompt, {
          schema: CHAT_RESPONSE_JSON_SCHEMA,
          ollamaModel: model,
          maxTokens: MAX_OUTPUT_TOKENS,
          onToken: (_fragment, full) => {
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
    return { chatResponse, chatId, messageId, semanticResult };
  } catch (error) {
    // The caller tells the renderer this one in plain words; every other
    // failure keeps the old swallow-and-report behaviour.
    if (isIndexUnavailable(error)) throw error;
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

  let aiRes;
  try {
    // Ask goes ahead of background AI work in the shared queue.
    aiRes = await foreground(() =>
      aiResponse(message, chatId, messageId, model, userId, {
        onPhase: (phase, extra) => emit("phase", { phase, ...extra }),
        onDelta: (text) => emit("delta", { text }),
        onReset: () => emit("reset"),
      }),
    );
  } catch (err) {
    emit("error", { message: err?.message || "Generation failed." });
    if (isIndexUnavailable(err))
      return { error: err.message, code: err.code, chatId, messageId };
    throw err;
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
