import React from "react";
import { motion } from "framer-motion";
import { FileText } from "lucide-react";
export interface MessageFile {
  type: "image" | "audio" | "pdf";
  path?: string;
  url: string; // data URL or object URL to display in UI
  name?: string;
  size?: number;
}

export interface Message {
  id: number;
  text: string;
  sender: "user" | "ai";
  files?: MessageFile[];
}

const formatFileSize = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

export const ChatBubble: React.FC<{
  isSwitching: boolean;
  message: Message;
  onImageClick: (url: string) => void;
  onPdfOpen: (path: string, name?: string) => void;
}> = ({ message, onImageClick, onPdfOpen, isSwitching }) => {
  const isUser = message.sender === "user";

  const imageFiles = (message.files || []).filter((f) => f.type === "image");
  const pdfFiles = (message.files || []).filter((f) => f.type === "pdf");
  const hasImage = imageFiles.length > 0;
  const hasPdf = pdfFiles.length > 0;

  return (
    <motion.div
      layout
      initial={isSwitching ? false : { opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex flex-col gap-2 max-w-[80%] ${
          isUser ? "items-end" : "items-start"
        }`}
      >
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
        {hasPdf && (
          <div className="flex flex-col gap-2 w-full">
            {pdfFiles.map((file, idx) => {
              const fileName =
                file.name || file.path?.split(/[\/\\]/).pop() || "Document.pdf";

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!file.path}
                  onClick={() => file.path && onPdfOpen(file.path, file.name)}
                  className={`flex items-center gap-3 w-full max-w-sm p-3 rounded-lg border transition-all duration-200 enabled:hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 ${
                    isUser
                      ? "bg-base-light dark:bg-base-dark border-border-light dark:border-border-dark enabled:hover:underline cursor-pointer"
                      : "bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark enabled:hover:bg-zinc-200/50 dark:enabled:hover:bg-zinc-700/50"
                  }`}
                >
                  <div className="flex-shrink-0 bg-red-500/10 dark:bg-red-400/10 p-3 rounded-full">
                    <FileText
                      size={20}
                      className="text-red-500 dark:text-red-400"
                    />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate ">{fileName}</p>
                    {file.size && (
                      <p className="text-xs text-text-light/70 dark:text-text-dark/70">
                        PDF Document • {formatFileSize(file.size)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {message.text && (
          <div
            className={`px-4 py-3 rounded-2xl shadow-sm max-w-fit ${
              isUser
                ? "bg-dark1 text-white rounded-br-lg"
                : "bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-bl-lg border border-border-light dark:border-border-dark"
            }`}
          >
            <p className="text-sm break-words leading-relaxed">
              {message.text}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatBubble;
