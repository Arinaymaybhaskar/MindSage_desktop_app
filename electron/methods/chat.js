import localDB from "../db/index.js";
import jwt from "jsonwebtoken";
import { eventBus } from "../eventBus.js";
import {
  generateContextTimeAndBaseQueryPrompt,
  respondWithContext,
  respondWithoutContext,
} from "./AIPrompts";
import {
  generateEmbedding,
  handleOllamaPrompt,
  streamOllamaPrompt,
} from "./ollama";
import { partialJsonString } from "./jsonStream.js";
import { SemanticSearch } from "./qdrant.js";
import z from "zod";

function getUserIdFromToken(token) {
  try {
    // 1. Guard against null or undefined tokens
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    // 2. Ensure the token was successfully decoded and has an id
    return decoded.id;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}

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
      console.warn("[chat:stream] failed to emit", type, err.message);
    }
  };
}

// Helper: parse and retry AI JSON
async function parseAIWithRetries(rawFn, schema, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log("calling ai");
      const raw = await rawFn();
      console.log("ai response", raw);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");

      return schema.parse(JSON.parse(jsonMatch[0]));
    } catch (err) {
      console.log(`Attempt ${attempt} failed: ${err.message}`);
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
    console.log(
      "aiResponse called with",
      "content: ",
      content,
      "chatId: ",
      chatId,
      "messageId: ",
      messageId,
      "model: ",
      model,
      "userId: ",
      userId,
    );
    const now = new Date();
    const currentTimeISO = now.toISOString();

    // 1️⃣ Generate propsRes
    onPhase("thinking");
    const queryPropsPrompt = generateContextTimeAndBaseQueryPrompt(
      content,
      currentTimeISO,
    );
    const propsRes = await parseAIWithRetries(
      () => handleOllamaPrompt("", "", model, queryPropsPrompt, true),
      propsResSchema,
      3,
    );
    console.log("Validated propsRes:", propsRes);

    let semanticResult = [];

    // 2️⃣ Semantic search logic
    if (propsRes.requires_context) {
      // Use original user content
      console.log("requires context");
      onPhase("searching");
      const vector = await generateEmbedding(content);
      semanticResult = await SemanticSearch(vector, userId, 5, "mind_entries");
    } else if (propsRes.requires_time_filter) {
      console.log("requires context with time filter");
      onPhase("searching");
      // Use base_query and time filter
      const vector = await generateEmbedding(propsRes.base_query);
      semanticResult = await SemanticSearch(vector, userId, 5, "mind_entries", {
        from: propsRes.time_filter_from,
        to: propsRes.time_filter_to,
      });
    }
    console.log(semanticResult, "Semantic Result");
    let mainPrompt;

    if (!propsRes.requires_context && semanticResult.length == 0) {
      console.log("No context needed");
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
        return streamOllamaPrompt(model, mainPrompt, {
          jsonMode: true,
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
    console.log(chatResponse, "ai chat res");
    return { chatResponse, chatId, messageId, semanticResult };
  } catch (error) {
    console.log(error, "error occcured");
    eventBus.emit("chat:error", error);
  }
}

async function storeAIResponse(aiRes, chatId) {
  try {
    if (!aiRes || !aiRes.chatResponse) {
      console.warn("[storeAIResponse] No AI response found to store.");
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

    console.log("[storeAIResponse] Stored AI message:", {
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
    console.error("[storeAIResponse] Error:", error);
    console.error("Params:", { chatId, aiRes });
    throw error;
  }
}

export const handleUserMessage = async (
  event,
  authMode,
  token,
  chatId,
  message,
  model,
  sources = [],
  files = [],
  streamId = null,
) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  const emit = makeStreamEmitter(event, streamId);
  if (authMode === "online") {
    console.log("online mode");
  } else {
    // If chatId is null → create new chat
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
    console.log(
      "aiResponse called with",
      "content: ",
      message,
      "chatId: ",
      chatId,
      "messageId: ",
      messageId,
      "model: ",
      model,
      "userId: ",
      userId,
    );

    // The chat id is only known here once a new chat has been created, and
    // the renderer needs it before the reply finishes so a mid-generation
    // chat switch can tell whose stream it is watching.
    emit("start", { chatId, messageId });

    let aiRes;
    try {
      aiRes = await aiResponse(message, chatId, messageId, model, userId, {
        onPhase: (phase, extra) => emit("phase", { phase, ...extra }),
        onDelta: (text) => emit("delta", { text }),
        onReset: () => emit("reset"),
      });
    } catch (err) {
      emit("error", { message: err?.message || "Generation failed." });
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
  }
};

export const handleGetChats = async (event, authMode, token, page, limit) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    const offset = (page - 1) * limit;
    return localDB.getChatsTitlesByUsers(userId, limit, offset);
  }
};

export const handleGetChatById = (event, authMode, token, chatId) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return Promise.resolve({
      error: "Invalid token",
    });
  }

  if (authMode === "online") {
    console.log("online mode");
    return Promise.resolve({ error: "Online mode not implemented" });
  }
  return localDB.getChatById(userId, chatId);
};

export const handleDeleteChat = async (event, authMode, token, chatId) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
    return { error: "Online mode not implemented" };
  } else {
    return localDB.deleteChat(userId, chatId);
  }
};

export const handleChangeChatTitle = async (
  event,
  authMode,
  token,
  chatId,
  newTitle,
) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
    return { error: "Online mode not implemented" };
  } else {
    return localDB.changeChatTitle(userId, chatId, newTitle);
  }
};

export const linkMediaToMessage = async (
  event,
  authMode,
  token,
  messageId,
  chatId,
  imageKey,
) => {
  console.log("linkMediaToMessage called with in method file:", {
    authMode,
    token,
    messageId,
    chatId,
    imageKey,
  });
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
    return { error: "Online mode not implemented" };
  } else {
    // Infer file type from extension
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
      console.error("Failed to infer file type for media link:", err);
      return localDB.linkMediaToMessage(messageId, chatId, imageKey, "image");
    }
  }
};
