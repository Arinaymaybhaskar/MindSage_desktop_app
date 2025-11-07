import React from "react";
import { motion } from "framer-motion";
import { FileText, Lightbulb, Link } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  followUpQuestion?: string;
  sources?: Array<{
    id: string;
    payload: {
      title?: string;
      source_type?: string;
      source_id?: string;
      goal_id?: string;
    };
  }>;
}

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
    <motion.button
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleClick}
      className="flex gap-3 mt-1 p-3 text-start rounded-lg bg-info/10 text-info text-sm font-medium hover:bg-info/20 cursor-pointer max-w-full break-words self-start"
    >
      <div className="bg-secondary-light dark:bg-secondary-dark p-1 w-7 h-7 flex items-center justify-center rounded-full">
        <Lightbulb size={16} />
      </div>
      <span className="break-words">{question}</span>
    </motion.button>
  );
};

export const ChatBubble: React.FC<{
  isSwitching: boolean;
  message: Message;
  onImageClick: (url: string) => void;
  onPdfOpen: (path: string, name?: string) => void;
  onFollowUpClick?: (question: string) => void;
}> = ({ message, onImageClick, onPdfOpen, onFollowUpClick, isSwitching }) => {
  const isUser = message.sender === "user";
  const navigate = useNavigate();
  const imageFiles = (message.files || []).filter((f) => f.type === "image");
  const pdfFiles = (message.files || []).filter((f) => f.type === "pdf");
  const hasImage = imageFiles.length > 0;
  const hasPdf = pdfFiles.length > 0;
  const hasSources = message.sources && message.sources.length > 0;
  const hasFollowUpQuestion = message.followUpQuestion;

  const handleSourceClicked = (source: any) => {
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

        {/* Sources Section */}
        {hasSources && !isUser && (
          <div className="flex flex-wrap gap-2 mt-1">
            {message.sources!.map((source, idx) => (
              <button
                key={idx}
                onClick={() => handleSourceClicked(source)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-tertiary-light dark:bg-tertiary-dark text-xs font-medium text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors cursor-pointer max-w-[120px]"
              >
                <Link size={12} className="text-accent flex-shrink-0" />
                <span className="truncate" title={source.payload?.title}>
                  {source.payload?.title || `Source ${idx + 1}`}
                </span>
              </button>
            ))}
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
