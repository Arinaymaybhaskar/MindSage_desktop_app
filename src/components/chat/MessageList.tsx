import React, { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { Message } from "../../types/Chat";
import ChatBubble from "./ChatBubble";
import LoadingBubble from "./LoadingBubble";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isSwitchingChats: boolean;
  loadingMessage: string;
  onImageClick: (url: string) => void;
  onPdfOpen: (path: string, name?: string) => Promise<void>;
  onFollowUpClick?: (question: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  isSwitchingChats,
  loadingMessage,
  onImageClick,
  onPdfOpen,
  onFollowUpClick,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="flex-grow p-4 md:p-6 overflow-y-auto">
      <div className="max-w-[44rem] mx-auto space-y-6 pb-40">
        <AnimatePresence>
          {messages.map((msg) => (
            <ChatBubble
              isSwitching={isSwitchingChats}
              key={msg.id}
              message={msg}
              onImageClick={onImageClick}
              onPdfOpen={onPdfOpen}
              onFollowUpClick={onFollowUpClick}
            />
          ))}
        </AnimatePresence>
        {isLoading && <LoadingBubble message={loadingMessage} />}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
};
