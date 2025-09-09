import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Mic, MicOff, Plus, FileText, X } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { Sidebar } from "../components/chat/Sidebar";
import { chatService } from "../api/chatService";
import { useAuth } from "../hooks/useAuth";
// START: Import the whisperService
import whisperService from "../api/whisperService";
// END: Import

const isFeatureEnabled = true;

interface Message {
  id: number;
  text: string;
  sender: "user" | "ai";
}

interface Chat {
  id: number;
  title: string;
}

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

const ChatBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.sender === "user";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`px-4 py-3 rounded-2xl shadow-sm ${
          isUser
            ? "bg-info text-white rounded-br-lg"
            : "bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-bl-lg border border-border-light dark:border-border-dark"
        }`}
      >
        <p className="text-sm break-words leading-relaxed">{message.text}</p>
      </div>
    </motion.div>
  );
};

const LoadingBubble: React.FC<{ message: string }> = ({ message }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="flex justify-start"
  >
    <div className="bg-surface-light dark:bg-surface-dark text-text-light-sub dark:text-text-dark-sub px-4 py-3 rounded-2xl rounded-bl-lg shadow-sm border border-border-light dark:border-border-dark">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 bg-text-light-sub/50 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
          <span className="h-2 w-2 bg-text-light-sub/50 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
          <span className="h-2 w-2 bg-text-light-sub/50 rounded-full animate-pulse"></span>
        </div>
        <span className="text-sm italic">{message}</span>
      </div>
    </div>
  </motion.div>
);

const ComingSoonPlaceholder: React.FC = () => {
  return (
    <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-secondary-light dark:bg-secondary-dark">
      <div className="p-4 bg-info/10 rounded-full mb-4">
        <Sparkles size={32} className="text-info" />
      </div>
      <h3 className="text-xl font-bold text-text-light dark:text-text-dark">
        AI Insights are Coming Soon!
      </h3>
      <p className="max-w-sm mt-2 text-sm text-text-light-sub dark:text-text-dark-sub">
        We're putting the final touches on our new AI chat feature. Soon, you'll
        be able to ask questions and get powerful insights from your journal
        entries.
      </p>
    </div>
  );
};

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

  const [attachedImage, setAttachedImage] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [model, setModel] = useState<string>("");
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const [greeting, setGreeting] = useState("");

  const starterPrompts = [
    "What’s on your mind right now?",
    "Would you like to reflect on today’s mood?",
    "Is there something you’d like to get clarity on?",
    "Want to capture a recent thought or experience?",
    "Shall we explore what’s been stressing you lately?",
  ];

  useEffect(() => {
    const randomPrompt =
      starterPrompts[Math.floor(Math.random() * starterPrompts.length)];
    setPrompt(randomPrompt);
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const model = await window.electron.ipcRenderer.invoke(
          "settings:getSelectedModel"
        );
        if (model) setModel(model);
      } catch (err) {
        console.error("[JournalForm] Failed to load settings from store:", err);
      }
    };
    fetchSettings();
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
        if (recentChats.length > 0) {
          setActiveChatId(recentChats[0].id);
          // Load messages for first chat
          const chatData = await chatService.getChatById(
            "offline",
            accessToken!,
            recentChats[0].id
          );
          if (chatData?.messages) {
            const formattedMessages = chatData.messages.map((m: any) => ({
              id: m.id,
              text: m.content,
              sender: m.sender,
            }));
            setMessages(formattedMessages);
          }
        }
      } catch (err) {
        console.error("Failed to load chats:", err);
      }
    };
    fetchChats();
  }, []);

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
    if ((!trimmedInput && !attachedImage) || isLoading) return;

    setIsLoading(true);

    try {
      const result = await chatService.sendMessage(
        "offline",
        accessToken!,
        activeChatId,
        trimmedInput,
        model,
        [], // sources (empty for now)
        attachedImage ? [attachedImage.file.name] : [] // files as filenames
      );

      if ("error" in result) {
        throw new Error(result.error);
      }

      // If new chat was created
      if (!activeChatId && result.chatId) {
        setActiveChatId(result.chatId);
        setChats((prev) => [...prev, { id: result.chatId, title: "New Chat" }]);
      }

      // Append user's message
      const userMessage: Message = {
        id: Date.now(),
        text: trimmedInput,
        sender: "user",
      };
      setMessages((prev) => [...prev, userMessage]);

      // Simulate AI response
      const aiMessage: Message = {
        id: Date.now() + 1,
        text: "AI response will be fetched via backend if integrated",
        sender: "ai",
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: "Failed to send message. Please try again.",
          sender: "ai",
        },
      ]);
    } finally {
      setInputValue("");
      setAttachedImage(null);
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
    setMessages([]);
    setIsLoading(true);
    try {
      const chatData = await chatService.getChatById(
        "offline",
        accessToken!,
        chatId
      );
      if (chatData?.messages) {
        const formattedMessages = chatData.messages.map((m: any) => ({
          id: m.id,
          text: m.content,
          sender: m.sender,
        }));
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
      handleImageFile(files[0]);
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

  const isChatEmpty = messages.length === 0;

  return (
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
                    <ChatBubble key={msg.id} message={msg} />
                  ))}
                </AnimatePresence>
                {isLoading && <LoadingBubble message={loadingMessage} />}
                <div ref={chatEndRef} />
              </div>
            </div>

            <motion.div
              layout
              animate={{
                justifyContent: isChatEmpty ? "center" : "flex-end",
              }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="w-full flex flex-col relative"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: isChatEmpty ? "50%" : "2rem",
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
                <div
                  className={`flex items-center w-full ${
                    attachedImage ? "px-1 pb-1" : "px-3 py-2"
                  }`}
                >
                  <div className="relative" ref={fileMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsFileMenuOpen((prev) => !prev)}
                      className="p-2 text-text-light-sub dark:text-text-dark-sub hover:text-info transition-colors"
                    >
                      <Plus size={18} />
                    </button>
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
                            className="flex items-center gap-2 w-full px-2 py-1 text-sm text-left rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <FileText size={16} /> Add PDF
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <TextareaAutosize
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
                        : "text-text-light-sub dark:text-text-dark-sub hover:text-info"
                    }`}
                    title={
                      isTranscribing
                        ? "Stop Transcription"
                        : "Start Transcription"
                    }
                  >
                    {isTranscribing ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>

                  <button
                    type="submit"
                    className="p-2 flex justify-center items-center text-info rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
};
