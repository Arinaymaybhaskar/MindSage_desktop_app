import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Sidebar } from "../components/chat/Sidebar";
import { chatService } from "../api/chatService";
import { useAuth } from "../hooks/useAuth";
import whisperService from "../api/whisperService";
import { LOADING_MESSAGES, STARTER_PROMPTS } from "../constants/chatConstants";
import { getGreeting } from "../utils/chatUtils";
import { MessageList } from "../components/chat/MessageList";
import { ChatWelcome } from "../components/chat/ChatWelcome";
import { ChatInput } from "../components/chat/ChatInput";

// ---- TYPES ----
import type { Chat, Message, MessageFile } from "../types/Chat";
// ---- CORRECTED LINE: Use 'import type' for the ref interface ----
import type { ChatInputRef } from "../components/chat/ChatInput";
import ComingSoonPlaceholder from "../components/chat/ComingSoonPlaceholder";
import ImageLightbox from "../components/chat/ImageLightbox";
import PdfLightbox from "../components/chat/PdfLightbox";

const isFeatureEnabled = true;

export const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [prompt, setPrompt] = useState("");
  const { accessToken } = useAuth();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pdfLightbox, setPdfLightbox] = useState<{
    path: string;
    name?: string;
  } | null>(null);
  const [isSwitchingChats, setIsSwitchingChats] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [attachedPdf, setAttachedPdf] = useState<{
    file: File;
  } | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [model, setModel] = useState<string>("");
  const [greeting, setGreeting] = useState("");
  const chatInputRef = useRef<ChatInputRef>(null);

  useEffect(() => {
    const randomPrompt =
      STARTER_PROMPTS[Math.floor(Math.random() * STARTER_PROMPTS.length)];
    setPrompt(randomPrompt);
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const models = await window.electron.ipcRenderer.invoke(
          "models:get-selected"
        );
        if (models?.chat) setModel(models.chat);
        else console.error("[Chat] No chat model selected");
      } catch (err) {
        console.error("[Chat] Failed to load model settings:", err);
      }
    };
    fetchSettings();
    const user = localStorage.getItem("userInfo");
    const userName = user ? JSON.parse(user).full_name.split(" ")[0] : "User";
    setGreeting(getGreeting(userName));
  }, []);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const recentChats = await chatService.getChats(
          "offline",
          accessToken!,
          1,
          10
        );
        setChats(recentChats);
      } catch (err) {
        console.error("Failed to load chats:", err as Error);
      }
    };
    fetchChats();
  }, [accessToken]);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessage((prev) => {
        const nextIndex =
          (LOADING_MESSAGES.indexOf(prev) + 1) % LOADING_MESSAGES.length;
        return LOADING_MESSAGES[nextIndex];
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    const unsubscribe = whisperService.onLiveData((data) => {
      if (data?.text) {
        chatInputRef.current?.appendText(data.text);
      }
    });
    return () => unsubscribe();
  }, []);

  const toggleLiveTranscription = async () => {
    if (isTranscribing) {
      await whisperService.stopLive();
      setIsTranscribing(false);
    } else {
      await whisperService.startLive();
      setIsTranscribing(true);
      chatInputRef.current?.focus();
    }
  };

  const handleSendMessage = async (inputValue: string) => {
    setIsLoading(true);
    setLoadingMessage("Sending message...");

    const userMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: "user",
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const result = await chatService.sendMessage(
        "offline",
        accessToken!,
        activeChatId,
        inputValue,
        model,
        [],
        []
      );
      console.log(result, "aiRes");

      if ("error" in result) throw new Error(result.error);

      const { chatId: newChatId, messageId: newMessageId } = result;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMessage.id ? { ...m, id: newMessageId } : m
        )
      );

      if (!activeChatId && newChatId) {
        setActiveChatId(newChatId);
        const title =
          inputValue.length > 0 && inputValue.length < 20
            ? inputValue
            : attachedImage?.file.name ?? "New Chat";
        setChats((prev) => [{ id: newChatId, title }, ...prev]);
      }

      if (attachedImage && newChatId && newMessageId) {
        setLoadingMessage("Uploading image...");
        const arrayBuffer = await attachedImage.file.arrayBuffer();
        const uploadResult = await window.electron.ipcRenderer.invoke(
          "media:save-chat-media",
          {
            messageId: newMessageId,
            chatId: newChatId,
            filetype: "image",
            arrayBuffer,
            filename: attachedImage.file.name,
          }
        );
        if (!uploadResult?.success)
          throw new Error(uploadResult.message || "Failed to upload image.");
        await chatService.linkMediaToMessage(
          "offline",
          accessToken!,
          newMessageId,
          newChatId,
          uploadResult.key!
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === newMessageId
              ? {
                  ...m,
                  files: [
                    ...(m.files || []),
                    { type: "image", url: attachedImage.previewUrl },
                  ],
                }
              : m
          )
        );
      }

      if (attachedPdf && newChatId && newMessageId) {
        setLoadingMessage("Uploading PDF...");
        const arrayBuffer = await attachedPdf.file.arrayBuffer();
        const uploadResult = await window.electron.ipcRenderer.invoke(
          "media:save-chat-media",
          {
            messageId: newMessageId,
            chatId: newChatId,
            filetype: "pdf",
            arrayBuffer,
            filename: attachedPdf.file.name,
          }
        );
        if (!uploadResult?.success)
          throw new Error(uploadResult.message || "Failed to upload PDF.");
        await chatService.linkMediaToMessage(
          "offline",
          accessToken!,
          newMessageId,
          newChatId,
          uploadResult.key!
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === newMessageId
              ? {
                  ...m,
                  files: [
                    ...(m.files || []),
                    {
                      type: "pdf",
                      url: "",
                      path: uploadResult.key,
                      name: attachedPdf.file.name,
                    },
                  ],
                }
              : m
          )
        );
      }

      setAttachedImage(null);
      setAttachedPdf(null);

      setLoadingMessage("Crafting a thoughtful response...");
      const aiMessage: Message = {
        id: Date.now() + 1,
        text: result.aiRes.chatResponse.response,
        sender: "ai",
        followUpQuestion: result.aiRes.chatResponse.suggested_user_prompt,
        sources: result.aiRes.semanticResult,
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error("Error sending message:", err as Error);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== userMessage.id),
        {
          id: Date.now(),
          text: `Failed to send message: ${(err as Error).message}`,
          sender: "ai",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setActiveChatId(null);
    setAttachedImage(null);
    setAttachedPdf(null);
  };

  const handleSelectChat = async (chatId: number) => {
    if (chatId === activeChatId) return;
    setActiveChatId(chatId);
    setIsLoading(true);
    setIsSwitchingChats(true);
    try {
      const chatData = await chatService.getChatById(
        "offline",
        accessToken!,
        chatId
      );
      if (chatData?.messages) {
        const formattedMessages: Message[] = await Promise.all(
          chatData.messages.map(async (m: any) => {
            let files: MessageFile[] | undefined;
            if (m.files && m.files.length > 0) {
              files = await Promise.all(
                m.files.map(async (f: any): Promise<MessageFile> => {
                  if (f.file_type === "image") {
                    const base64: string =
                      await window.electron.ipcRenderer.invoke(
                        "media:getImage",
                        f.file_path
                      );
                    return { type: "image", path: f.file_path, url: base64 };
                  }
                  return {
                    type: "pdf",
                    path: f.file_path,
                    url: "",
                    name: f.file_path.split(/[/\\]/).pop(),
                  };
                })
              );
            }
            return { id: m.id, text: m.content, sender: m.sender, files };
          })
        );
        setMessages(formattedMessages);
      }
    } catch (err) {
      console.error("Failed to load chat messages:", err);
      setMessages([
        {
          id: Date.now(),
          text: "Failed to load messages. Please try again.",
          sender: "ai",
        },
      ]);
    } finally {
      setIsSwitchingChats(false);
      setIsLoading(false);
    }
  };

  const handleDeleteChat = async (chatId: number) => {
    try {
      await chatService.deleteChat("offline", accessToken!, chatId);
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
      if (chatId === activeChatId) handleClearChat();
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  const handleRenameChat = async (chatId: number, newTitle: string) => {
    try {
      await chatService.changeTitle("offline", accessToken!, chatId, newTitle);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, title: newTitle } : chat
        )
      );
    } catch (error) {
      console.error("Failed to edit chat title:", error);
    }
  };

  const handlePdfOpen = async (path: string, name?: string) => {
    try {
      const dataUrl = await window.electron.ipcRenderer.invoke(
        "media:getPdf",
        path
      );
      if (dataUrl) {
        setPdfDataUrl(dataUrl);
        setPdfLightbox({ path, name });
      }
    } catch (e) {
      console.error("Failed to load PDF", e);
    }
  };

  const handleImageAttached = (file: File) => {
    if (attachedImage) URL.revokeObjectURL(attachedImage.previewUrl);
    setAttachedImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleRemoveImage = () => {
    if (attachedImage) URL.revokeObjectURL(attachedImage.previewUrl);
    setAttachedImage(null);
  };

  const isChatEmpty = messages.length === 0 && !isLoading;

  return (
    <>
      <div className="flex h-full w-full bg-secondary-light dark:bg-secondary-dark">
        <Sidebar
          chats={chats}
          handleClearChat={handleClearChat}
          handleSelectChat={handleSelectChat}
          handleDeleteChat={handleDeleteChat}
          handleRenameChat={handleRenameChat}
        />
        <div className="flex-1 flex flex-col bg-secondary-light dark:bg-secondary-dark text-text-light dark:text-text-dark shadow-lg border border-border-light dark:border-border-dark overflow-hidden relative">
          {isFeatureEnabled ? (
            <>
              <MessageList
                messages={messages}
                isLoading={isLoading}
                isSwitchingChats={isSwitchingChats}
                loadingMessage={loadingMessage}
                onImageClick={setLightboxUrl}
                onPdfOpen={handlePdfOpen}
                onFollowUpClick={(question: string) => {
                  chatInputRef.current?.appendText(question);
                  chatInputRef.current?.focus();
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-10 bg-gradient-to-t from-secondary-light dark:from-secondary-dark to-transparent" />
              <motion.div
                layout
                animate={{
                  justifyContent: isChatEmpty ? "center" : "flex-end",
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="w-full flex flex-col absolute left-0 right-0 z-20"
                style={{
                  bottom: isChatEmpty ? "50%" : "2.5rem",
                  transform: isChatEmpty ? "translateY(50%)" : "translateY(0)",
                }}
              >
                {isChatEmpty && (
                  <ChatWelcome greeting={greeting} prompt={prompt} />
                )}
                <ChatInput
                  ref={chatInputRef}
                  isLoading={isLoading}
                  isTranscribing={isTranscribing}
                  attachedImage={attachedImage}
                  attachedPdf={attachedPdf}
                  onSendMessage={handleSendMessage}
                  onToggleTranscription={toggleLiveTranscription}
                  onImageAttached={handleImageAttached}
                  onPdfAttached={setAttachedPdf}
                  onRemoveImage={handleRemoveImage}
                  onRemovePdf={() => setAttachedPdf(null)}
                />
              </motion.div>
            </>
          ) : (
            <ComingSoonPlaceholder />
          )}
        </div>
      </div>
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {pdfLightbox && (
        <PdfLightbox
          name={pdfLightbox.name}
          path={pdfLightbox.path}
          dataUrl={pdfDataUrl}
          onClose={() => {
            setPdfLightbox(null);
            setPdfDataUrl(null);
          }}
        />
      )}
    </>
  );
};
