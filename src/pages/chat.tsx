import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Mic,
  MicOff,
  Plus,
  FileText,
  X,
  Image as ImageIcon,
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { Sidebar } from "../components/chat/Sidebar";
import { chatService } from "../api/chatService";
import { useAuth } from "../hooks/useAuth";
import whisperService from "../api/whisperService";
import type { Chat, Message, MessageFile } from "../types/Chat";
import ChatBubble from "../components/chat/ChatBubble";
import LoadingBubble from "../components/chat/LoadingBubble";
import ComingSoonPlaceholder from "../components/chat/ComingSoonPlaceholder";
import ImageLightbox from "../components/chat/ImageLightbox";
import PdfLightbox from "../components/chat/PdfLightbox";

const isFeatureEnabled = true;

const starterPrompts = [
  "What’s on your mind right now?",
  "Would you like to reflect on today’s mood?",
  "Is there something you’d like to get clarity on?",
  "Want to capture a recent thought or experience?",
  "Shall we explore what’s been stressing you lately?",
];

// Types moved to src/types/Chat

const loadingMessages = [
  "Consulting the digital consciousness...",
  "Analyzing your entries for patterns...",
  "Crafting a thoughtful response...",
  "Connecting insights from your journal...",
];

function getGreeting(name: string) {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name} `;
}

export const ChatComponent: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const chatEndRef = useRef<HTMLDivElement>(null);
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
  const [isDragging, setIsDragging] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [model, setModel] = useState<string>("");
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [greeting, setGreeting] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const randomPrompt =
      starterPrompts[Math.floor(Math.random() * starterPrompts.length)];
    setPrompt(randomPrompt);
  }, []);

  // Update the model fetching useEffect
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const models = await window.electron.ipcRenderer.invoke(
          "models:get-selected"
        );
        // Use the chat model for conversations
        if (models?.chat) {
          setModel(models.chat);
        } else {
          console.error("[Chat] No chat model selected");
        }
      } catch (err) {
        console.error("[Chat] Failed to load model settings:", err);
      }
    };
    fetchSettings();
    // Get user greeting
    const user = localStorage.getItem("userInfo");
    const userName = user ? JSON.parse(user).full_name.split(" ")[0] : "User";
    setGreeting(getGreeting(userName));
  }, []);

  // --- Fetch recent chats ---
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessage((prev) => {
        const nextIndex =
          (loadingMessages.indexOf(prev) + 1) % loadingMessages.length;
        return loadingMessages[nextIndex];
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoading]);

  // START: Add the listener for live transcription data
  useEffect(() => {
    const unsubscribe = whisperService.onLiveData((data) => {
      if (data?.text) {
        setInputValue(
          (prev) => (prev ? prev.trim() + " " : "") + data.text.trim()
        );
      }
    });
    return () => unsubscribe();
  }, []);
  // END: Add listener

  // START: Update the toggle function to use the service
  const toggleLiveTranscription = async () => {
    if (isTranscribing) {
      await whisperService.stopLive();
      setIsTranscribing(false);
    } else {
      await whisperService.startLive();
      setIsTranscribing(true);
    }
  };
  // END: Update toggle function

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedInput = inputValue.trim();
    if ((!trimmedInput && !attachedImage && !attachedPdf) || isLoading) return;

    setIsLoading(true);
    setLoadingMessage("Sending message...");

    // Create a temporary user message for the UI to update instantly
    const userMessage: Message = {
      id: Date.now(),
      text: trimmedInput,
      sender: "user",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue(""); // Clear input immediately for better UX

    try {
      // Step 1: Send the text content to create the message and get IDs
      const result = await chatService.sendMessage(
        "offline",
        accessToken!,
        activeChatId,
        trimmedInput,
        model,
        [],
        [] // Send without files initially
      );

      if ("error" in result) {
        throw new Error(result.error);
      }
      console.log("step1 complete", result);

      const newChatId = result.chatId;
      const newMessageId = result.messageId; // Assuming sendMessage returns the new message ID

      // Reconcile the temporary message id with the actual id from DB
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMessage.id ? { ...m, id: newMessageId } : m
        )
      );

      // If it's a new chat, update the state
      if (!activeChatId && newChatId) {
        setActiveChatId(newChatId);
        const title =
          trimmedInput.length > 0 && trimmedInput.length < 20
            ? trimmedInput
            : attachedImage?.file.name ?? "New Chat";
        setChats((prev) => [{ id: newChatId, title }, ...prev]);
      }

      // Step 2: If there's an image, upload it now that we have the IDs
      if (attachedImage && newChatId && newMessageId) {
        setLoadingMessage("Uploading image...");
        const arrayBuffer = await attachedImage.file.arrayBuffer();

        const uploadResult = await window.electron.ipcRenderer.invoke(
          "media:save-chat-media", // This should match your main process handler key
          {
            messageId: newMessageId,
            chatId: newChatId,
            filetype: "image",
            arrayBuffer,
            filename: attachedImage.file.name,
          }
        );

        if (!uploadResult || !uploadResult.success) {
          throw new Error(uploadResult.message || "Failed to upload image.");
        }
        const imageKey = uploadResult.key;

        console.log("step2 complete", uploadResult);
        // Step 3: Link the uploaded media key to the message in the database
        try {
          await chatService.linkMediaToMessage(
            "offline",
            accessToken!,
            newMessageId,
            newChatId,
            imageKey!
          );
          console.log("step3 complete");
          // Optimistically attach preview to the just-sent message
          const previewUrl = attachedImage.previewUrl;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === newMessageId
                ? {
                    ...m,
                    files: [
                      ...(m.files || []),
                      { type: "image", url: previewUrl },
                    ],
                  }
                : m
            )
          );
        } catch (error) {
          console.error("Error linking media to message:", error);
        }
      }

      setAttachedImage(null); // Clear the attached image after successful send
      // Upload PDF if present
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

        if (!uploadResult || !uploadResult.success) {
          throw new Error(uploadResult.message || "Failed to upload PDF.");
        }
        const pdfKey = uploadResult.key;

        try {
          await chatService.linkMediaToMessage(
            "offline",
            accessToken!,
            newMessageId,
            newChatId,
            pdfKey!
          );
          // Optimistically attach pdf meta to the just-sent message
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
                        path: pdfKey,
                        name: attachedPdf.file.name,
                      },
                    ],
                  }
                : m
            )
          );
        } catch (error) {
          console.error("Error linking PDF to message:", error);
        }
      }

      setAttachedPdf(null);

      // Step 4: Get the AI response (existing logic)
      setLoadingMessage("Crafting a thoughtful response...");
      const aiMessage: Message = {
        id: Date.now() + 1,
        text: "AI response will be fetched via backend if integrated",
        sender: "ai",
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      const e = err as Error;
      console.error("Error sending message:", e);
      // Replace the temporary user message with an error state or remove it
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== userMessage.id),
        {
          id: Date.now(),
          text: `Failed to send message: ${e.message}`,
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
    setInputValue("");
    setAttachedImage(null);
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
        console.log("Loaded chat data", {
          chatId,
          messagesCount: chatData.messages.length,
          sample: chatData.messages.slice(0, 2),
        });
        const formattedMessages: Message[] = await Promise.all(
          chatData.messages.map(
            async (m: {
              id: number;
              content: string;
              sender: "user" | "ai";
              files?: Array<{ file_type: string; file_path: string }>;
            }) => {
              let files: MessageFile[] | undefined = undefined;
              if (m.files && m.files.length > 0) {
                const urls: MessageFile[] = [];
                for (const f of m.files) {
                  if (f.file_type === "image") {
                    try {
                      const base64: string =
                        await window.electron.ipcRenderer.invoke(
                          "media:getImage",
                          f.file_path
                        );
                      const fallbackFileUrl = `file:///${f.file_path.replace(
                        /\\/g,
                        "/"
                      )}`;
                      urls.push({
                        type: "image",
                        path: f.file_path,
                        url: base64 || fallbackFileUrl,
                      });
                    } catch (e) {
                      console.error(
                        "Failed to load image for message",
                        m.id,
                        e as Error
                      );
                      const fallbackFileUrl = `file:///${f.file_path.replace(
                        /\\/g,
                        "/"
                      )}`;
                      urls.push({
                        type: "image",
                        path: f.file_path,
                        url: fallbackFileUrl,
                      });
                    }
                  } else if (f.file_type === "pdf") {
                    urls.push({
                      type: "pdf",
                      path: f.file_path,
                      url: "",
                      name: f.file_path.split(/[/\\]/).pop(),
                    });
                  }
                }
                if (urls.length > 0) files = urls;
              }
              return {
                id: m.id,
                text: m.content,
                sender: m.sender,
                files,
              } as Message;
            }
          )
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
  const handleImageFile = (file: File | null) => {
    if (file && file.type.startsWith("image/")) {
      if (attachedImage) {
        URL.revokeObjectURL(attachedImage.previewUrl);
      }
      setAttachedImage({ file, previewUrl: URL.createObjectURL(file) });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf") {
        setAttachedPdf({ file });
      } else if (file.type.startsWith("image/")) {
        handleImageFile(file);
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        handleImageFile(file);
        event.preventDefault();
        break;
      }
    }
  };

  const openImagePicker = () => {
    fileInputRef.current?.click();
  };
  const openPdfPicker = () => {
    pdfInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (file) {
      if (file.type.startsWith("image/")) {
        handleImageFile(file);
      }
    }
    // reset value to allow re-selecting the same file later
    e.currentTarget.value = "";
    setIsFileMenuOpen(false);
  };
  const handlePdfInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (file && file.type === "application/pdf") {
      setAttachedPdf({ file });
    }
    e.currentTarget.value = "";
    setIsFileMenuOpen(false);
  };

  const handleDeleteChat = async (chatId: number) => {
    try {
      await chatService.deleteChat("offline", accessToken!, chatId);
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    } catch (error) {
      console.error("Failed to delete chat:", error);
      return;
    }
    if (chatId === activeChatId) {
      setActiveChatId(null);
      setMessages([]);
      setInputValue("");
      setAttachedImage(null);
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

  const removeAttachedImage = () => {
    if (attachedImage) {
      URL.revokeObjectURL(attachedImage.previewUrl);
      setAttachedImage(null);
    }
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
              <div className="flex-grow p-4 md:p-6 overflow-y-auto">
                <div className="max-w-[44rem] mx-auto space-y-6 pb-40">
                  <AnimatePresence>
                    {messages.map((msg) => (
                      <ChatBubble
                        isSwitching={isSwitchingChats}
                        key={msg.id}
                        message={msg}
                        onImageClick={(url) => setLightboxUrl(url)}
                        onPdfOpen={async (path, name) => {
                          try {
                            const dataUrl =
                              await window.electron.ipcRenderer.invoke(
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
                        }}
                      />
                    ))}
                  </AnimatePresence>
                  {isLoading && <LoadingBubble message={loadingMessage} />}
                  <div ref={chatEndRef} />
                </div>
              </div>
              {/* Vignette Overlay */}
              <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-10">
                <div className="h-full w-full bg-gradient-to-t from-secondary-light dark:from-secondary-dark to-transparent" />
              </div>

              <motion.div
                layout
                animate={{
                  justifyContent: isChatEmpty ? "center" : "flex-end",
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="w-full flex flex-col relative z-20"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: isChatEmpty ? "50%" : "2.5rem",
                  transform: isChatEmpty ? "translateY(50%)" : "translateY(0)",
                }}
              >
                {isChatEmpty && (
                  <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold">{greeting}</h1>
                    <p className="text-lg text-text-light-sub dark:text-text-dark-sub">
                      {prompt}
                    </p>
                  </div>
                )}
                <form
                  onSubmit={handleSendMessage}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full max-w-[44rem] bg-tertiary-light dark:bg-tertiary-dark rounded-2xl border border-border-light dark:border-border-dark mx-auto transition-all ease-in-out duration-200
                  ${attachedImage ? "flex-col p-2" : "flex-row items-center"} ${
                    isDragging
                      ? "border-info ring-2 ring-info ring-opacity-50"
                      : ""
                  }`}
                >
                  {attachedImage && (
                    <div className="relative w-28 h-28 ml-1 mt-1 mb-3 rounded-lg overflow-hidden">
                      <img
                        src={attachedImage.previewUrl}
                        alt="Attached preview"
                        className="w-full h-full object-cover rounded-md"
                      />
                      <button
                        type="button"
                        onClick={removeAttachedImage}
                        className="absolute top-1.5 right-1.5 p-1 bg-white bg-opacity-60 text-black rounded-full hover:bg-opacity-80 transition-all focus:outline-none flex items-center justify-center z-10"
                        aria-label="Remove image"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {attachedPdf && (
                    <div className="flex items-center justify-between mx-2 my-2 px-3 py-2 rounded-md border bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
                      <div className="flex items-center gap-2">
                        <FileText
                          size={16}
                          className="text-dark1 dark:text-light1"
                        />
                        <span className="text-sm truncate max-w-[12rem]">
                          {attachedPdf.file.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachedPdf(null)}
                        className="text-xs text-text-light-sub dark:text-text-dark-sub hover:text-red-500"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div
                    className={`flex items-center w-full ${
                      attachedImage ? "px-1 pb-1" : "px-3 py-2"
                    }`}
                  >
                    <div className="relative" ref={fileMenuRef}>
                      <button
                        type="button"
                        onClick={() => setIsFileMenuOpen((prev) => !prev)}
                        className="p-2 text-text-light-sub dark:text-text-dark-sub hover:text-dark1 dark:text-light1 transition-colors"
                      >
                        <Plus size={18} />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handlePdfInputChange}
                      />
                      <AnimatePresence>
                        {isFileMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.2 }}
                            className="absolute bottom-12 left-0 w-40 bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg shadow-lg p-3 z-50"
                          >
                            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-2">
                              Add Files
                            </h4>
                            <button
                              type="button"
                              onClick={openImagePicker}
                              className="flex items-center gap-2 w-full px-2 py-1 text-sm text-left rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <ImageIcon size={16} /> Add image
                            </button>
                            <button
                              type="button"
                              onClick={openPdfPicker}
                              className="flex items-center gap-2 w-full px-2 py-1 text-sm text-left rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <FileText size={16} /> Add PDF
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <TextareaAutosize
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Ask about your journal entries..."
                      className="flex-1 bg-transparent resize-none border-none focus:outline-none text-text-light dark:text-text-dark px-2 py-1"
                      rows={1}
                      maxRows={5}
                      disabled={isLoading}
                    />

                    <button
                      type="button"
                      onClick={toggleLiveTranscription}
                      className={`p-2 transition-colors ${
                        isTranscribing
                          ? "text-red-500 animate-pulse"
                          : "text-text-light-sub dark:text-text-dark-sub hover:text-danger"
                      }`}
                      title={
                        isTranscribing
                          ? "Stop Transcription"
                          : "Start Transcription"
                      }
                    >
                      {isTranscribing ? (
                        <MicOff size={18} />
                      ) : (
                        <Mic size={18} />
                      )}
                    </button>

                    <button
                      type="submit"
                      className="p-2 flex justify-center items-center text-dark1 dark:text-light1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={
                        isLoading || (!inputValue.trim() && !attachedImage)
                      }
                      aria-label="Send message"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </form>
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
