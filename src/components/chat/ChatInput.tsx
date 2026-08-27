import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
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
import { useClickOutside } from "../../hooks/useClickOutside"; // ---- NEW: Import the hook ----

// Interface for the props the component receives
interface AttachedImage {
  file: File;
  previewUrl: string;
}
interface AttachedPdf {
  file: File;
}
interface ChatInputProps {
  isLoading: boolean;
  isTranscribing: boolean;
  attachedImage: AttachedImage | null;
  attachedPdf: AttachedPdf | null;
  onSendMessage: (text: string) => void;
  onToggleTranscription: () => void;
  onImageAttached: (file: File) => void;
  onPdfAttached: (file: File) => void;
  onRemoveImage: () => void;
  onRemovePdf: () => void;
}

export interface ChatInputRef {
  appendText: (text: string) => void;
  focus: () => void;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  (
    {
      isLoading,
      isTranscribing,
      attachedImage,
      attachedPdf,
      onSendMessage,
      onToggleTranscription,
      onImageAttached,
      onPdfAttached,
      onRemoveImage,
      onRemovePdf,
    },
    ref
  ) => {
    const [inputValue, setInputValue] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileMenuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    // ---- NEW: Use the hook to close the menu ----
    useClickOutside(fileMenuRef, () => setIsFileMenuOpen(false));

    useImperativeHandle(ref, () => ({
      appendText(text: string) {
        setInputValue((prev) => (prev ? prev.trim() + " " : "") + text.trim());
        inputRef.current?.focus();
      },
      focus() {
        inputRef.current?.focus();
      },
    }));

    useEffect(() => {
      inputRef.current?.focus();
    }, []);

    const handleSendMessage = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmedInput = inputValue.trim();
      if ((!trimmedInput && !attachedImage && !attachedPdf) || isLoading)
        return;
      onSendMessage(trimmedInput);
      setInputValue("");
    };

    const handleFile = (file: File | null) => {
      if (!file) return;
      if (file.type.startsWith("image/")) {
        onImageAttached(file);
      } else if (file.type === "application/pdf") {
        onPdfAttached(file);
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
      if (files && files.length > 0) handleFile(files[0]);
    };
    const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) onImageAttached(file);
          event.preventDefault();
          break;
        }
      }
    };
    const openImagePicker = () => fileInputRef.current?.click();
    const openPdfPicker = () => pdfInputRef.current?.click();
    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFile(e.target.files?.[0] || null);
      e.currentTarget.value = "";
      setIsFileMenuOpen(false);
    };
    const handlePdfInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFile(e.target.files?.[0] || null);
      e.currentTarget.value = "";
      setIsFileMenuOpen(false);
    };

    return (
      <form
        onSubmit={handleSendMessage}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full max-w-[44rem] bg-tertiary-light dark:bg-tertiary-dark rounded-2xl border border-border-light dark:border-border-dark mx-auto transition-all ease-in-out duration-200
        ${attachedImage ? "flex-col p-2" : "flex-row items-center"} ${
          isDragging ? "border-info ring-2 ring-info ring-opacity-50" : ""
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
              onClick={onRemoveImage}
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
              <FileText size={16} className="text-dark1 dark:text-light1" />
              <span className="text-sm truncate max-w-[12rem]">
                {attachedPdf.file.name}
              </span>
            </div>
            <button
              type="button"
              onClick={onRemovePdf}
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
            data-testid="chat-composer"
            placeholder="Ask about your journal entries..."
            className="flex-1 bg-transparent resize-none border-none focus:outline-none text-text-light dark:text-text-dark px-2 py-1"
            rows={1}
            maxRows={5}
            disabled={isLoading}
          />

          <button
            type="button"
            data-testid="chat-mic-toggle"
            onClick={onToggleTranscription}
            className={`p-2 transition-colors ${
              isTranscribing
                ? "text-red-500 animate-pulse"
                : "text-text-light-sub dark:text-text-dark-sub hover:text-danger"
            }`}
            title={
              isTranscribing ? "Stop Transcription" : "Start Transcription"
            }
          >
            {isTranscribing ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            type="submit"
            data-testid="chat-send"
            className="p-2 flex justify-center items-center text-dark1 dark:text-light1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || (!inputValue.trim() && !attachedImage)}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    );
  }
);
