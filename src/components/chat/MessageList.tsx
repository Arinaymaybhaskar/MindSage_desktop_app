import React, { useCallback, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { Message } from "../../types/Chat";
import ChatBubble from "./ChatBubble";
import LoadingBubble, { type ChatPhase } from "./LoadingBubble";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isSwitchingChats: boolean;
  loadingMessage: string;
  /** Id of the reply currently being written into, or null when idle. */
  streamingId?: number | null;
  /** Stage of the pipeline currently running, for the indicator's icon. */
  phase?: ChatPhase | null;
  onImageClick: (url: string) => void;
  onPdfOpen: (path: string, name?: string) => Promise<void>;
  onFollowUpClick?: (question: string) => void;
}

/**
 * Distance from the bottom, in pixels, still treated as "following along".
 * Generous enough to survive the layout shift a newly appended line causes.
 */
const STICK_THRESHOLD = 120;

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  isSwitchingChats,
  loadingMessage,
  streamingId = null,
  phase = null,
  onImageClick,
  onPdfOpen,
  onFollowUpClick,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the view should follow new content. A streamed reply grows on
   * every token, and scrolling unconditionally would drag the user back down
   * the moment they scrolled up to re-read something.
   */
  const stickToBottom = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance <= STICK_THRESHOLD;
  }, []);

  // Length of the streamed reply, so the scroll effect below can depend on the
  // text growing without depending on the whole `messages` array, which is
  // replaced on every token.
  const streamedLength =
    streamingId === null
      ? 0
      : messages.find((m) => m.id === streamingId)?.text.length ?? 0;

  // A new message arriving: smooth, because it happens once.
  useEffect(() => {
    if (!stickToBottom.current) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  // Streaming: jump rather than animate. Smooth scrolls queued dozens of times
  // a second fight each other and the text visibly judders.
  useEffect(() => {
    if (!streamedLength || !stickToBottom.current) return;
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [streamedLength]);

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      className="flex-grow p-4 md:p-6 overflow-y-auto"
    >
      <div className="max-w-[44rem] mx-auto space-y-6 pb-40">
        <AnimatePresence>
          {messages.map((msg) => (
            <ChatBubble
              isSwitching={isSwitchingChats}
              isStreaming={msg.id === streamingId}
              key={msg.id}
              message={msg}
              onImageClick={onImageClick}
              onPdfOpen={onPdfOpen}
              onFollowUpClick={onFollowUpClick}
            />
          ))}
        </AnimatePresence>

        {/* Once text is arriving it speaks for itself; the phase caption is
            only useful while there is nothing to show yet. */}
        {isLoading && streamingId === null && (
          <LoadingBubble message={loadingMessage} phase={phase} />
        )}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
};
