import { db } from "./connection.js";

export const addAIResponse = async (
  chatId,
  content,
  sources = [],
  files = [],
) => {
  try {
    const insertMessageStmt = db.prepare(`
            INSERT INTO messages (chat_id, sender, content)
            VALUES (?, 'ai', ?)
        `);

    const insertSourceStmt = db.prepare(`
            INSERT INTO message_sources (message_id, source_type, source_id)
            VALUES (?, ?, ?)
        `);

    const insertFileStmt = db.prepare(`
            INSERT INTO files (chat_id, message_id, file_type, file_path)
            VALUES (?, ?, ?, ?)
        `);

    const transaction = db.transaction(() => {
      // Insert the AI message
      const result = insertMessageStmt.run(chatId, content);
      const messageId = result.lastInsertRowid;

      // Optional: insert message sources
      if (sources && sources.length > 0) {
        for (const source of sources) {
          insertSourceStmt.run(messageId, source.source_type, source.source_id);
        }
      }

      // Optional: insert files
      if (files && files.length > 0) {
        for (const file of files) {
          insertFileStmt.run(chatId, messageId, file.file_type, file.file_path);
        }
      }

      // Update chat's last updated timestamp
      db.prepare(
        `
                UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `,
      ).run(chatId);

      return messageId;
    });

    const messageId = transaction();
    return { id: messageId };
  } catch (error) {
    console.error("[addAIResponse] Error:", error);
    console.error("Params:", { chatId, content, sources, files });
    throw error;
  }
};

export const getChatsTitlesByUsers = async (userId, limit = 10, offset = 0) => {
  try {
    const stmt = db.prepare(`
            SELECT 
                c.id, 
                c.title,
                MAX(m.created_at) AS last_message_time
            FROM chats c
            LEFT JOIN messages m ON c.id = m.chat_id
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY last_message_time DESC NULLS LAST
            LIMIT ? OFFSET ?
        `);

    const chats = stmt.all(userId, limit, offset);
    return chats;
  } catch (error) {
    console.error("[getChatsTitlesByUsers] Error:", error);
    console.error("Params:", { userId, limit, offset });
    throw error;
  }
};

export const getChatById = async (userId, chatId) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(() => {
      try {
        const chatStmt = db.prepare(`
                    SELECT * FROM chats WHERE user_id = ? AND id = ?
                `);

        const chat = chatStmt.get(userId, chatId);
        if (!chat) return null;

        const stmt = db.prepare(`
                    SELECT 
                        m.id as message_id,
                        m.sender,
                        m.content,
                        m.created_at as message_created_at,
                        f.id as file_id,
                        f.file_type,
                        f.file_path,
                        f.created_at as file_created_at,
                        s.id as source_id,
                        s.source_type,
                        s.source_id as source_ref_id,
                        s.source_title
                    FROM messages m
                    LEFT JOIN files f ON m.id = f.message_id
                    LEFT JOIN message_sources s ON m.id = s.message_id
                    WHERE m.chat_id = ?
                    ORDER BY m.created_at ASC, s.id ASC
                `);

        const rows = stmt.all(chatId);

        const messagesMap = new Map();

        rows.forEach((row) => {
          const messageId = row.message_id;

          if (!messagesMap.has(messageId)) {
            messagesMap.set(messageId, {
              id: messageId,
              chat_id: chatId,
              sender: row.sender,
              content: row.content,
              created_at: row.message_created_at,
              files: [],
              sources: [],
            });
          }

          const message = messagesMap.get(messageId);

          if (row.file_id && !message.files.find((f) => f.id === row.file_id)) {
            message.files.push({
              id: row.file_id,
              file_type: row.file_type,
              file_path: row.file_path,
              created_at: row.file_created_at,
            });
          }

          if (
            row.source_id &&
            !message.sources.find((s) => s.id === row.source_id)
          ) {
            // source_title is stored when the reply is saved but was
            // never selected here, so reopening a conversation lost
            // the names of the entries it had been based on.
            message.sources.push({
              id: row.source_id,
              source_type: row.source_type,
              source_id: row.source_ref_id,
              source_title: row.source_title,
            });
          }
        });

        chat.messages = Array.from(messagesMap.values());

        return chat;
      } catch (error) {
        console.error("[getChatById] Transaction error:", error);
        console.error("Params:", { userId, chatId });
        throw error;
      }
    });

    try {
      const result = transaction();
      resolve(result);
    } catch (error) {
      console.error("[getChatById] Outer error:", error);
      reject(error);
    }
  });
};

export const AddChat = async (userId, chatData) => {
  try {
    const { title, model } = chatData;
    const stmt = db.prepare(`
            INSERT INTO chats (user_id, title, model)
            VALUES (?, ?, ?)
        `);
    const result = stmt.run(userId, title, model);
    return { id: result.lastInsertRowid };
  } catch (error) {
    console.error("[AddChat] Error:", error);
    console.error("Params:", { userId, chatData });
    throw error;
  }
};

export const deleteChat = async (userId, chatId) => {
  try {
    const stmt = db.prepare(`
            DELETE FROM chats WHERE user_id = ? AND id = ?
        `);
    const result = stmt.run(userId, chatId);
    return result.changes > 0;
  } catch (error) {
    console.error("[deleteChat] Error:", error);
    console.error("Params:", { userId, chatId });
    throw error;
  }
};

export const changeChatTitle = async (userId, chatId, newTitle) => {
  try {
    const stmt = db.prepare(`
            UPDATE chats SET title = ? WHERE user_id = ? AND id = ?
        `);
    const result = stmt.run(newTitle, userId, chatId);
    return result.changes > 0;
  } catch (error) {
    console.error("[changeChatTitle] Error:", error);
    console.error("Params:", { userId, chatId, newTitle });
    throw error;
  }
};

export const addMessage = async (chatId, sender, content, sources, files) => {
  try {
    const insertMessageStmt = db.prepare(`
            INSERT INTO messages (chat_id, sender, content)
            VALUES (?, ?, ?)
        `);

    const insertSourceStmt = db.prepare(`
            INSERT INTO message_sources (message_id, source_type, source_id, source_title)
            VALUES (?, ?, ?, ?)
        `);

    const insertFileStmt = db.prepare(`
            INSERT INTO files (chat_id, message_id, file_type, file_path)
            VALUES (?, ?, ?, ?)
        `);

    const insertTransaction = db.transaction(() => {
      const result = insertMessageStmt.run(chatId, sender, content);
      const messageId = result.lastInsertRowid;

      if (sources && sources.length > 0) {
        for (const source of sources) {
          insertSourceStmt.run(
            messageId,
            source.source_type,
            source.source_id,
            source.source_title,
          );
        }
      }

      if (files && files.length > 0) {
        for (const file of files) {
          insertFileStmt.run(chatId, messageId, file.file_type, file.file_path);
        }
      }

      return messageId;
    });

    const messageId = insertTransaction();
    return { id: messageId };
  } catch (error) {
    console.error("[addMessage] Error:", error);
    console.error("Params:", { chatId, sender, content, sources, files });
    throw error;
  }
};
