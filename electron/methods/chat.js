import localDB from "../db";
import jwt from "jsonwebtoken";
import { eventBus } from "../eventBus";

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
        eventBus.emit("chat:new-message", { content: message, chatId, messageId, model, userId });
        return { chatId, messageId };
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
