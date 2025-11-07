import localDB from "../db";
import jwt from "jsonwebtoken";
import { eventBus } from "../eventBus";
import { generateContextTimeAndBaseQueryPrompt, respondWithContext, respondWithoutContext } from "./AIPrompts";
import { generateEmbedding, handleOllamaPrompt } from "./ollama";
import { SemanticSearch } from "./qdrant";
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
const propsResSchema = z.object({
    requires_context: z.boolean(),
    requires_time_filter: z.boolean(),
    time_filter_from: z.string().nullable(),
    time_filter_to: z.string().nullable(),
    base_query: z.string(),
    notes: z.string()
});

const chatResponseSchema = z.object({
    response: z.string(),
    suggested_user_prompt: z.string()
});

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
            if (attempt === maxRetries) throw new Error(`Failed after ${maxRetries} attempts`);
        }
    }
}

async function aiResponse(content, chatId, messageId, model, userId) {
    try {
        console.log("aiResponse called with", "content: ", content, "chatId: ", chatId, "messageId: ", messageId, "model: ", model, "userId: ", userId);
        const now = new Date();
        const currentTimeISO = now.toISOString();

        // 1️⃣ Generate propsRes
        const queryPropsPrompt = generateContextTimeAndBaseQueryPrompt(content, currentTimeISO);
        const propsRes = await parseAIWithRetries(
            () => handleOllamaPrompt("", "", model, queryPropsPrompt, true),
            propsResSchema,
            3
        );
        console.log("Validated propsRes:", propsRes);

        let semanticResult = [];

        // 2️⃣ Semantic search logic
        if (propsRes.requires_context) {
            // Use original user content
            console.log("requires context")
            const vector = await generateEmbedding(content);
            semanticResult = await SemanticSearch(vector, userId, 5, "mind_entries");
        } else if (propsRes.requires_time_filter) {
            console.log("requires context with time filter")
            // Use base_query and time filter
            const vector = await generateEmbedding(propsRes.base_query);
            semanticResult = await SemanticSearch(vector, userId, 5, "mind_entries", {
                from: propsRes.time_filter_from,
                to: propsRes.time_filter_to
            });
        }
        console.log(semanticResult, "Semantic Result");
        let mainPrompt;

        if (!propsRes.requires_context && semanticResult.length == 0) {
            console.log("No context needed")
            mainPrompt = respondWithoutContext(content);
        } else {
            // 3️⃣ Generate prompt for main AI response
            mainPrompt = respondWithContext(
                content,
                semanticResult,
            );
        }

        // 4️⃣ Get final chat response
        const chatResponse = await parseAIWithRetries(
            () => handleOllamaPrompt("", "", model, mainPrompt, true),
            chatResponseSchema,
            3
        );
        console.log(chatResponse, "ai chat res")
        return { chatResponse, chatId, messageId, semanticResult };

    } catch (error) {
        console.log(error, "error occcured");
        eventBus.emit("chat:error", error);
    }
};

async function storeAIResponse(aiRes, chatId) {
    try {
        if (!aiRes || !aiRes.chatResponse) {
            console.warn("[storeAIResponse] No AI response found to store.");
            return null;
        }

        const { chatResponse, semanticResult } = aiRes;
        const { response, follow_up_question } = chatResponse;

        // Combine response and follow-up question (if exists)
        let finalContent = response;
        if (follow_up_question) {
            finalContent += `\n\nFollow-up: ${follow_up_question}`;
        }

        // Extract relevant sources from semanticResult payload
        const sources =
            (semanticResult || [])
                .filter(s => s.payload && s.payload.source_type && s.payload.source_id)
                .map(s => ({
                    source_type: s.payload.source_type,
                    source_id: String(s.payload.source_id),
                    source_title: String(s.payload.title)
                }));

        // Store AI message
        const aiMessage = await localDB.addMessage(chatId, "ai", finalContent, sources, []);
        const aiMessageId = aiMessage?.id ?? null;

        console.log("[storeAIResponse] Stored AI message:", {
            chatId,
            aiMessageId,
            sourcesCount: sources.length
        });

        return {
            aiMessageId,
            content: finalContent,
            followUp: follow_up_question || null
        };

    } catch (error) {
        console.error("[storeAIResponse] Error:", error);
        console.error("Params:", { chatId, aiRes });
        throw error;
    }
}


export const handleUserMessage = async (event, authMode, token, chatId, message, model, sources = [], files = []) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        // If chatId is null → create new chat
        if (!chatId) {
            const title = message.length < 20 ? message : "chat";
            const newChat = await localDB.AddChat(userId, { title, model });
            chatId = newChat.id;
        }


        // Add the user's message
        const userMessage = await localDB.addMessage(chatId, "user", message, sources, files);
        const messageId = userMessage.id;
        // eventBus.emit("chat:new-message", { content: message, chatId, messageId, model, userId });
        console.log("aiResponse called with", "content: ", message, "chatId: ", chatId, "messageId: ", messageId, "model: ", model, "userId: ", userId);
        const aiRes = await aiResponse(message, chatId, messageId, model, userId);

        // Store AI response in DB
        const { aiMessageId } = await storeAIResponse(aiRes, chatId);
        return { chatId, aiMessageId, aiRes };
    }
};

export const handleGetChats = async (event, authMode, token, page, limit) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    }
    else {
        const offset = (page - 1) * limit;
        return localDB.getChatsTitlesByUsers(userId, limit, offset);
    }
}

export const handleGetChatById = (event, authMode, token, chatId) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return Promise.resolve({
            error: "Invalid token"
        });
    }

    if (authMode === "online") {
        console.log("online mode")
        return Promise.resolve({ error: "Online mode not implemented" });
    }
    return localDB.getChatById(userId, chatId);
}

export const handleDeleteChat = async (event, authMode, token, chatId) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
        return { error: "Online mode not implemented" };
    } else {
        return localDB.deleteChat(userId, chatId);
    }
}

export const handleChangeChatTitle = async (event, authMode, token, chatId, newTitle) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
        return { error: "Online mode not implemented" };
    } else {
        return localDB.changeChatTitle(userId, chatId, newTitle);
    }
}

export const linkMediaToMessage = async (event, authMode, token, messageId, chatId, imageKey) => {
    console.log("linkMediaToMessage called with in method file:", { authMode, token, messageId, chatId, imageKey });
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
        return { error: "Online mode not implemented" };
    } else {
        // Infer file type from extension
        try {
            const lower = String(imageKey).toLowerCase();
            let fileType = 'image';
            if (lower.endsWith('.pdf')) fileType = 'pdf';
            else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp')) fileType = 'image';
            // Store with inferred type
            return localDB.linkMediaToMessage(messageId, chatId, imageKey, fileType);
        } catch (err) {
            console.error('Failed to infer file type for media link:', err);
            return localDB.linkMediaToMessage(messageId, chatId, imageKey, 'image');
        }
    }
}
