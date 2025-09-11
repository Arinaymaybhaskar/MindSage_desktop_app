const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const chatService = {
  sendMessage: async (
    authMode: "online" | "offline",
    token: string,
    chatId: number | null,
    message: string,
    model: string,
    sources: string[] = [],
    files: string[] = []
  ): Promise<
    | {
        messageId: any;
        chatId: number;
        userMessage: any;
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
      files
    );
  },
  getChats: async (
    authMode: "online" | "offline",
    token: string,
    page: number = 0,
    limit: number = 10
  ): Promise<any[]> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:get-chats",
      authMode,
      token,
      page,
      limit
    );
  },
  deleteChat: async (
    authMode: "online" | "offline",
    token: string,
    chatId: number
  ): Promise<{ success: boolean; message: string }> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:delete-chat",
      authMode,
      token,
      chatId
    );
  },
  changeTitle: async (
    authMode: "online" | "offline",
    token: string,
    chatId: number,
    newTitle: string
  ): Promise<{ success: boolean; message: string }> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:change-title",
      authMode,
      token,
      chatId,
      newTitle
    );
  },
  getChatById: async (
    authMode: "online" | "offline",
    token: string,
    chatId: number
  ): Promise<any> => {
    checkElectron();
    return window.electron.ipcRenderer.invoke(
      "chat:get-by-id",
      authMode,
      token,
      chatId
    );
  },
  linkMediaToMessage: async (
    authModel: "online" | "offline",
    token: string,
    messageId: number,
    chatId: number,
    mediaKey: string
  ): Promise<{ success: boolean; key?: string; message?: string }> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "media:linkMessage",
      authModel,
      token,
      messageId,
      chatId,
      mediaKey
    );
  },
};
