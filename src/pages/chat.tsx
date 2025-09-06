import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User, Send, Sparkles, Info, Trash2 } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";

// --- Feature Flag ---
const isFeatureEnabled = false;

// --- TYPE DEFINITIONS ---
interface Message {
  id: number;
  text: string;
  sender: "user" | "ai";
}
type Provider = "ollama" | "gemini";

// --- MOCK API & DATA (remains the same) ---
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
  await new Promise((resolve) =>
    setTimeout(resolve, 2000 + Math.random() * 2000)
  );
  return {
    answer: `This is a simulated response from ${provider} regarding "${userInput}". In a real application, this would contain meaningful insights based on your journal entries.`,
  };
};

// --- Themed Sub-components ---

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
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-tertiary-light dark:bg-tertiary-dark rounded-full">
          <Bot size={18} className="text-info" />
        </div>
      )}
      <div
        className={`max-w-xs md:max-w-md lg:max-w-2xl px-4 py-3 rounded-2xl shadow-sm ${
          isUser
            ? "bg-info text-white rounded-br-lg"
            : "bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-bl-lg border border-border-light dark:border-border-dark"
        }`}
      >
        <p className="text-sm break-words leading-relaxed">{message.text}</p>
      </div>
      {isUser && (
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-tertiary-light dark:bg-tertiary-dark rounded-full">
          <User
            size={18}
            className="text-text-light-sub dark:text-text-dark-sub"
          />
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
    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-tertiary-light dark:bg-tertiary-dark rounded-full">
      <Bot size={18} className="text-info" />
    </div>
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

// --- Main Chat Component ---
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
    <div className="w-full h-full flex flex-col bg-secondary-light dark:bg-secondary-dark text-text-light dark:text-text-dark rounded-xl shadow-lg border border-border-light dark:border-border-dark overflow-hidden">
      <header className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border-light dark:border-border-dark">
        <div className="flex items-center gap-3">
          <Sparkles className="text-info" />
          <h2 className="text-lg font-bold">MindSage AI Chat</h2>
        </div>
        <div className="flex items-center gap-2">
          {isFeatureEnabled && (
            <button
              onClick={handleClearChat}
              className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark hover:text-danger"
              title="Clear chat"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </header>

      {isFeatureEnabled ? (
        <>
          {provider === "ollama" && (
            <div className="p-3 bg-info/10 border-b border-info/20 text-info text-xs flex items-start gap-2">
              <Info size={16} className="flex-shrink-0 mt-0.5" />
              <p>
                You're using a local model. Performance depends on your
                hardware. The first query may take a moment to load the model.
              </p>
            </div>
          )}

          <div className="flex-grow p-4 md:p-6 overflow-y-auto">
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

          <div className="flex-shrink-0 border-t border-border-light dark:border-border-dark p-4 bg-surface-light dark:bg-surface-dark">
            <form
              onSubmit={handleSendMessage}
              className="flex items-start gap-3"
            >
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
                className="flex-1 p-3 bg-tertiary-light dark:bg-tertiary-dark border border-border-light dark:border-border-dark rounded-xl resize-none focus:ring-2 focus:ring-info focus:outline-none transition"
                rows={1}
                maxRows={5}
                disabled={isLoading}
              />
              <button
                type="submit"
                className="p-3 bg-info text-white font-semibold rounded-full hover:bg-info/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all transform hover:scale-105"
                disabled={isLoading || !inputValue.trim()}
                aria-label="Send message"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </>
      ) : (
        <ComingSoonPlaceholder />
      )}
    </div>
  );
};
