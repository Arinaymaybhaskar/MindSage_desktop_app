import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User, Send, Sparkles, Info, Trash2 } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";

// --- TYPE DEFINITIONS ---
interface Message {
  id: number;
  text: string;
  sender: "user" | "ai";
}
type Provider = "ollama" | "gemini";

// --- MOCK API & DATA ---
const loadingMessages = [
  "Consulting the digital consciousness...",
  "Analyzing your entries for patterns...",
  "Crafting a thoughtful response...",
  "Connecting insights from your journal...",
];

const fetchAiResponse = async (
  userInput: string,
  provider: Provider
): Promise<{ answer: string }> => {
  console.log(`Fetching response for "${userInput}" from ${provider}`);
  // Simulate API delay
  await new Promise((resolve) =>
    setTimeout(resolve, 2000 + Math.random() * 2000)
  );
  return {
    answer: `This is a simulated response from ${provider} regarding "${userInput}". In a real application, this would contain meaningful insights based on your journal entries.`,
  };
};

// --- SUB-COMPONENTS ---
const ChatBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.sender === "user";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`flex items-start gap-3 ${isUser ? "justify-end" : ""}`}
    >
      {!isUser && (
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full">
          <Bot size={18} className="text-gray-600 dark:text-gray-300" />
        </div>
      )}
      <div
        className={`max-w-xs md:max-w-md lg:max-w-2xl px-4 py-3 rounded-2xl shadow-sm ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-lg"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-lg"
        }`}
      >
        <p className="text-sm break-words leading-relaxed">{message.text}</p>
      </div>
      {isUser && (
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full">
          <User size={18} className="text-gray-600 dark:text-gray-300" />
        </div>
      )}
    </motion.div>
  );
};

const LoadingBubble: React.FC<{ message: string }> = ({ message }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="flex items-start gap-3"
  >
    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full">
      <Bot size={18} className="text-gray-600 dark:text-gray-300" />
    </div>
    <div className="bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-4 py-3 rounded-2xl rounded-bl-lg shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
          <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
          <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse"></span>
        </div>
        <span className="text-sm italic">{message}</span>
      </div>
    </div>
  </motion.div>
);

// --- MAIN CHAT COMPONENT ---
export const ChatComponent: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hello! I'm your AI assistant. Ask me anything about your journal entries to discover patterns, insights, or summaries.",
      sender: "ai",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const [provider, setProvider] = useState<Provider>("gemini");
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      text: trimmedInput,
      sender: "user",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const { answer } = await fetchAiResponse(trimmedInput, provider);
      const aiMessage: Message = {
        id: Date.now() + 1,
        text: answer,
        sender: "ai",
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: "Sorry, I encountered an error. Please try again.",
        sender: "ai",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 1,
        text: "Chat cleared. How can I help you reflect today?",
        sender: "ai",
      },
    ]);
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <Sparkles className="text-indigo-500" />
          <h2 className="text-lg font-bold">MindSage AI Chat</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
            title="Clear chat"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {provider === "ollama" && (
        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20 text-blue-800 dark:text-blue-200 text-xs flex items-start gap-2">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <p>
            You're using a local model. Performance depends on your hardware.
            The first query may take a moment to load the model.
          </p>
        </div>
      )}

      {/* Chat Messages */}
      {/* Added pb-20 to the main container and pb-4 to the inner div */}
      <div className="flex-grow p-4 md:p-6 overflow-y-auto pb-20">
        <div className="space-y-6 pb-4">
          <AnimatePresence>
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>
          {isLoading && <LoadingBubble message={loadingMessage} />}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input Form */}
      <div className="flex-shrink-0 pb-16 border-t border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-800/50">
        <form onSubmit={handleSendMessage} className="flex items-start gap-3">
          <TextareaAutosize
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask about your journal entries..."
            className="flex-1 p-3 bg-gray-100 dark:bg-gray-700 border border-transparent rounded-xl resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
            rows={1}
            maxRows={5}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="p-3 bg-indigo-600 text-white font-semibold rounded-full hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-all transform hover:scale-105"
            disabled={isLoading || !inputValue.trim()}
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};
