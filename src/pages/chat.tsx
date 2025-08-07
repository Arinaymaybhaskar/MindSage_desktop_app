import React, { useState, useEffect, useRef } from "react";
import api from "../api/axios";

// --- TYPE DEFINITIONS ---
interface Message {
  id: number;
  text: string;
  sender: "user" | "ai";
}

type Provider = "ollama" | "gemini";

// --- NEW: Affirming Messages ---
// A list of messages to cycle through during the loading state.
const loadingMessages = [
  "Connecting with your digital consciousness...",
  "Scanning your journal for relevant memories...",
  "Consulting the AI for deep insights...",
  "Analyzing your entries...",
  "Finding patterns in your thoughts...",
  "Just a moment, great insights take time...",
];

// --- API HELPER FUNCTION ---
const fetchAiResponse = async (
  endpoint: string,
  userInput: string,
  provider: Provider
) => {

  const response = await api.post(endpoint, {
    query: userInput,
    provider: provider,
  });
  return response.data;
};

// --- CHAT BUBBLE SUB-COMPONENT ---
const ChatBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.sender === "user";
  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-xs md:max-w-md lg:max-w-xl px-4 py-3 rounded-2xl shadow-md ${
          isUser
            ? "bg-blue-600 text-white rounded-br-none"
            : "bg-white text-gray-800 rounded-bl-none"
        }`}
      >
        <p className="text-sm break-words">{message.text}</p>
      </div>
    </div>
  );
};

// --- REUSABLE CHAT COMPONENT ---
export const ChatComponent: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hello! How can I help you reflect on your journal entries today?",
      sender: "ai",
    },
  ]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>(
    loadingMessages[0]
  );
  const [provider, setProvider] = useState<Provider>("ollama"); // State for the selected provider
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Effect to scroll to the bottom of the chat on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Effect to cycle through loading messages
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      let currentIndex = 0;
      setLoadingMessage(loadingMessages[currentIndex]);

      interval = setInterval(() => {
        currentIndex = (currentIndex + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[currentIndex]);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const apiEndpoint = `/journals/chat`;
      // Use the selected provider from the component's state
      const aiText = await fetchAiResponse(apiEndpoint, trimmedInput, provider);
      const aiMessage: Message = {
        id: Date.now() + 1,
        text: aiText.answer,
        sender: "ai",
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Failed to fetch AI response:", error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: `Sorry, an error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Please try again.`,
        sender: "ai",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const topHeight = provider === "ollama" ? "110px" : "67vh";

  return (
    <div className="w-full h-full flex flex-col">
      <div className={`h-[${topHeight}] flex-shrink-0`}>
        {/* Header */}
        <div className="border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">
            MindSage AI Chat
          </h2>
          {/* --- NEW: Model Selector --- */}
          <div className="flex items-center space-x-2">
            <label
              htmlFor="provider-select"
              className="text-sm font-medium text-gray-600"
            >
              Model:
            </label>
            <div className="relative">
              <select
                id="provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none"
              >
                <option value="ollama" className="p-2">
                  <img src="ollama.png" alt="ollama icon" className="w-6 h-6" />
                  Ollama
                </option>
                <option value="gemini">
                  {" "}
                  <img
                    src="gemini-color.png"
                    alt="gemini-icon"
                    className="w-6 h-6"
                  />
                  Gemini
                </option>
              </select>
              <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                {provider === "ollama" ? (
                  <img src="ollama.png" alt="ollama icon" className="w-6 h-6" />
                ) : (
                  <img
                    src="gemini-color.png"
                    alt="gemini-icon"
                    className="w-6 h-6"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {provider === "ollama" && (
          <div className="p-3 bg-blue-50 border-b border-blue-200 text-blue-800 text-xs flex items-start space-x-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 mt-0.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p>
              You're using a local model. Performance depends on your system's
              hardware. The first query may take a minute to warm up the model.
            </p>
          </div>
        )}
      </div>
      <div className="py-6 my-0 mx-10 flex-grow overflow-y-auto">
        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-500 px-4 py-3 rounded-2xl rounded-bl-none shadow-md">
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
                      <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse"></span>
                    </div>
                    <span className="text-sm text-gray-600 italic">
                      {loadingMessage}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      </div>
      <div className="border-t flex-shrink-0 border-gray-200 p-3 px-10 bg-white rounded-b-lg h-[69px] bottom-0 w-full ">
        <form
          onSubmit={handleSendMessage}
          className="flex items-center space-x-3"
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder="Ask about your journal entries..."
            className="flex-1 p-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
            rows={1}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="p-3 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            disabled={isLoading || !inputValue.trim()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-send-horizontal"
            >
              <path d="m3 3 3 9-3 9 19-9Z" />
              <path d="M6 12h16" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};
