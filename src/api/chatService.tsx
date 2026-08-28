import type { Chat, ChatDetail, MessageSource } from "../types/Chat";

/** What `media:save-chat-media` answers with after storing an attachment. */
export interface ChatMediaUploadResult {
  success: boolean;
  key?: string;
  message?: string;
}

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

/**
 * One frame of a chat generation, pushed from the main process.
 *
 * `phase` reports which stage of the pipeline is running - the reply is
 * produced by two sequential model calls, and only the second one streams, so
 * without this the first several seconds would look like nothing happening.
 * `reset` means a parse attempt failed and its partial text must be discarded
 * before the retry streams over it.
 */
export type ChatStreamEvent =
  | { streamId: string; type: "start"; chatId: number; messageId: number }
  | {
      streamId: string;
      type: "phase";
      phase: "thinking" | "searching" | "writing";
      sources?: unknown[];
    }
  | { streamId: string; type: "delta"; text: string }
  | { streamId: string; type: "reset" }
  | { streamId: string; type: "done"; aiMessageId: number | null }
  | { streamId: string; type: "error"; message: string };

export const chatService = {
  sendMessage: async (
    authMode: "online" | "offline",
    token: string,
    chatId: number | null,
    message: string,
    model: string,
    sources: string[] = [],
    files: string[] = [],
    streamId?: string,
  ): Promise<
    | {
        messageId: number;
        chatId: number;
        aiMessageId: number | null;
        aiRes: {
          chatResponse: { response: string; suggested_user_prompt: string };
          semanticResult?: MessageSource[];
        };
      }
    | { error: string }
  > => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:send-message",
      authMode,
      token,
      chatId,
      message,
      model,
      sources,
      files,
      streamId,
    );
  },

  /**
   * Subscribes to generation events. Returns an unsubscribe function; the
   * preload bridge removes only this listener, so several subscribers can
   * coexist safely.
   */
  onStream: (callback: (event: ChatStreamEvent) => void): (() => void) => {
    checkElectron();
    return window.electron.ipcRenderer.on(
      "chat:stream",
      callback as (...args: unknown[]) => void,
    );
  },
  getChats: async (
    authMode: "online" | "offline",
    token: string,
    page: number = 0,
    limit: number = 10,
  ): Promise<Chat[]> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:get-chats",
      authMode,
      token,
      page,
      limit,
    );
  },
  deleteChat: async (
    authMode: "online" | "offline",
    token: string,
    chatId: number,
  ): Promise<{ success: boolean; message: string }> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:delete-chat",
      authMode,
      token,
      chatId,
    );
  },
  changeTitle: async (
    authMode: "online" | "offline",
    token: string,
    chatId: number,
    newTitle: string,
  ): Promise<{ success: boolean; message: string }> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:change-title",
      authMode,
      token,
      chatId,
      newTitle,
    );
  },
  getChatById: async (
    authMode: "online" | "offline",
    token: string,
    chatId: number,
  ): Promise<ChatDetail | null> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:get-by-id",
      authMode,
      token,
      chatId,
    );
  },
  linkMediaToMessage: async (
    authModel: "online" | "offline",
    token: string,
    messageId: number,
    chatId: number,
    mediaKey: string,
  ): Promise<{ success: boolean; key?: string; message?: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "media:linkMessage",
      authModel,
      token,
      messageId,
      chatId,
      mediaKey,
    );
  },
};
