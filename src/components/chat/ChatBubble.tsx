import React, { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, FileText, Lightbulb, Link } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Markdown from "./Markdown";
import { MindSageMark } from "../ui/MindSageMark";

import type { Message, MessageFile, MessageSource } from "../../types/Chat";

export type { Message, MessageFile, MessageSource };

const formatFileSize = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// ⬇️ Follow-up button component
const FollowUpButton: React.FC<{
  question: string;
  onClick?: (question: string) => void;
}> = ({ question, onClick }) => {
  const [visible, setVisible] = React.useState(true);

  const handleClick = () => {
    setVisible(false);
    onClick?.(question);
  };

  if (!visible) return null;

  return (
    // A suggestion, not an answer: outlined rather than filled, so it reads as
    // something offered next to the reply instead of competing with it. The
    // solid accent block it replaced drew more attention than the reply above.
    <motion.button
      layout
      data-testid="chat-followup-chip"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleClick}
      className="group/fu flex items-start gap-2.5 mt-1 ml-10 px-3 py-2 text-start rounded-xl border border-info/30 bg-info/5 text-sm text-text-light dark:text-text-dark hover:bg-info/10 hover:border-info/50 transition-colors cursor-pointer max-w-full break-words self-start"
    >
      <Lightbulb size={15} className="mt-0.5 flex-shrink-0 text-info" />
      <span className="break-words leading-snug">{question}</span>
    </motion.button>
  );
};

export const ChatBubble: React.FC<{
  isSwitching: boolean;
  /** True while this reply is still being generated. */
  isStreaming?: boolean;
  message: Message;
  onImageClick: (url: string) => void;
  onPdfOpen: (path: string, name?: string) => void;
  onFollowUpClick?: (question: string) => void;
}> = ({
  message,
  onImageClick,
  onPdfOpen,
  onFollowUpClick,
  isSwitching,
  isStreaming = false,
}) => {
  const isUser = message.sender === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard can be unavailable; the button simply does nothing */
    }
  };
  const navigate = useNavigate();
  const imageFiles = (message.files || []).filter((f) => f.type === "image");
  const pdfFiles = (message.files || []).filter((f) => f.type === "pdf");
  const hasImage = imageFiles.length > 0;
  const hasPdf = pdfFiles.length > 0;
  const hasSources = message.sources && message.sources.length > 0;
  const hasFollowUpQuestion = message.followUpQuestion;

  const handleSourceClicked = (source: MessageSource) => {
    switch (source.payload.source_type) {
      case "journal":
        navigate(`/journal/view/${source.payload.source_id}`);
        break;
      case "goal":
        navigate(`goals/view/${source.payload.source_id}`);
        break;
      default:
        navigate(`goals/view/${source.payload.goal_id}`);
        break;
    }
  };

  return (
    <motion.div
      // Layout animation is turned off while streaming: the bubble's height
      // changes on every token, and spring-animating each change leaves the
      // box visibly chasing the text it is supposed to contain.
      layout={!isStreaming}
      data-testid="chat-message"
      data-streaming={isStreaming ? "true" : undefined}
      initial={isSwitching ? false : { opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex flex-col gap-2 ${
          isUser ? "items-end max-w-[80%]" : "items-start w-full max-w-[46rem]"
        }`}
      >
        {/* Image Attachments */}
        {hasImage && (
          <div
            className={`grid gap-2 ${
              imageFiles.length > 1 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {imageFiles.map((file, idx) => (
              <img
                key={idx}
                src={file.url}
                alt="attachment"
                className="w-[260px] h-[260px] object-cover rounded-lg cursor-pointer border border-border-light dark:border-border-dark hover:opacity-95 transition"
                onClick={() => onImageClick(file.url!)}
              />
            ))}
          </div>
        )}

        {/* PDF Attachments */}
        {hasPdf && (
          <div className="flex flex-col gap-2 w-full">
            {pdfFiles.map((file, idx) => {
              const fileName =
                file.name || file.path?.split(/[\\/]/).pop() || "Document.pdf";

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!file.path}
                  onClick={() => file.path && onPdfOpen(file.path, file.name)}
                  className={`flex items-center gap-3 w-full max-w-sm p-3 rounded-lg border transition-all duration-200 enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 ${
                    isUser
                      ? "bg-base-light dark:bg-base-dark border-border-light dark:border-border-dark enabled:hover:underline cursor-pointer"
                      : "bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark enabled:hover:bg-tertiary-light dark:enabled:hover:bg-tertiary-dark"
                  }`}
                >
                  <div className="flex-shrink-0 bg-red-500/10 dark:bg-red-400/10 p-3 rounded-full">
                    <FileText
                      size={20}
                      className="text-red-500 dark:text-red-400"
                    />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate text-text-light dark:text-text-dark">
                      {fileName}
                    </p>
                    {file.size && (
                      <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                        PDF Document • {formatFileSize(file.size)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Message Text */}
        {message.text &&
          (isUser ? (
            // The user's own words stay in a bubble: short, and the accent fill
            // makes turn-taking readable at a glance.
            <div className="px-4 py-2.5 rounded-2xl rounded-br-md bg-dark1 text-white shadow-sm">
              <div className="text-sm break-words leading-relaxed">
                <Markdown content={message.text} tone="inverted" />
              </div>
            </div>
          ) : (
            // The assistant's answer is not boxed. These replies run long and
            // carry structure - lists, headings, code - and a narrow bubble
            // fights all of it. Letting the text sit on the page is how modern
            // assistants read, and it gives markdown room to breathe.
            <div className="group/msg relative flex gap-3 w-full">
              <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-light1/40 dark:bg-dark1 flex items-center justify-center">
                <MindSageMark
                  size={14}
                  className="text-dark1 dark:text-light1"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm break-words leading-[1.7] text-text-light dark:text-text-dark">
                  <Markdown
                    content={message.text}
                    caret={isStreaming}
                    reveal={isStreaming}
                  />
                </div>

                {/* Hidden while streaming: copying a half-written answer gives
                    the user something they did not ask for. */}
                {!isStreaming && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label="Copy message"
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-light-sub dark:text-text-dark-sub opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-opacity"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            </div>
          ))}

        {/* Entries the answer was drawn from. Previously these were unlabelled
            pills capped at 120px, which cut most titles mid-word ("Money
            afte…", "Starting thi…") and left a row of fragments with nothing
            to say what they were. */}
        {hasSources && !isUser && (
          <div className="mt-1 ml-10 flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-light-sub/70 dark:text-text-dark-sub/70">
              Based on {message.sources!.length}{" "}
              {message.sources!.length === 1 ? "entry" : "entries"}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {message.sources!.map((source, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSourceClicked(source)}
                  title={source.payload?.title}
                  className="group/src inline-flex items-center gap-1.5 max-w-[15rem] px-2.5 py-1 rounded-lg border border-border-light dark:border-border-dark bg-transparent text-xs text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark hover:text-text-light dark:hover:text-text-dark transition-colors cursor-pointer"
                >
                  <Link
                    size={11}
                    className="flex-shrink-0 opacity-60 group-hover/src:opacity-100"
                  />
                  <span className="truncate">
                    {source.payload?.title?.trim() || `Entry ${idx + 1}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Follow-Up Question */}
        {hasFollowUpQuestion && !isUser && (
          <FollowUpButton
            question={message.followUpQuestion!}
            onClick={onFollowUpClick}
          />
        )}
      </div>
    </motion.div>
  );
};

export default ChatBubble;
