import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Menu,
  ChevronLeft,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Edit3,
} from "lucide-react";
import clsx from "clsx";
import { useClickOutside } from "../../hooks/useClickOutside"; // Assuming you have this hook from our previous conversation

interface Chat {
  id: number;
  title: string;
}

interface SidebarProps {
  chats: Chat[];
  handleClearChat: () => void;
  handleSelectChat: (chatId: number) => void;
  handleDeleteChat?: (chatId: number) => void;
  handleRenameChat?: (chatId: number, newTitle: string) => void;
}

// Animation variants for the text labels
const textVariants = {
  hidden: { opacity: 0, x: -10, transition: { duration: 0.2 } },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2, delay: 0.1 } },
};

// Animation variants for the dropdown menu
const dropdownVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: -10 },
};

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  handleClearChat,
  handleSelectChat,
  handleDeleteChat,
  handleRenameChat,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  // Rename popup state
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameChatId, setRenameChatId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");

  // Use the custom hook to close the dropdown
  useClickOutside(dropdownContainerRef, () => setOpenDropdownId(null));

  // Set initial active chat
  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [chats, activeChatId]);

  const selectChat = (chatId: number) => {
    handleSelectChat(chatId);
    setActiveChatId(chatId);
  };

  const toggleDropdown = (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDropdownId(openDropdownId === chatId ? null : chatId);
  };

  const handleDelete = (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (handleDeleteChat) {
      handleDeleteChat(chatId);
    }
    setOpenDropdownId(null);

    if (activeChatId === chatId) {
      const remainingChats = chats.filter((chat) => chat.id !== chatId);
      const newActiveId = remainingChats[0]?.id || null;
      setActiveChatId(newActiveId);
      if (newActiveId) {
        handleSelectChat(newActiveId);
      } else {
        handleClearChat();
      }
    }
  };

  const handleRename = (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDropdownId(null);
    setRenameChatId(chatId);
    const chat = chats.find((c) => c.id === chatId);
    setNewTitle(chat?.title || "");
    setIsRenameOpen(true);
  };

  const confirmRename = () => {
    if (renameChatId && newTitle.trim()) {
      handleRenameChat?.(renameChatId, newTitle.trim());
    }
    setIsRenameOpen(false);
    setRenameChatId(null);
    setNewTitle("");
  };

  return (
    <>
      <motion.div
        initial={{ width: 280 }}
        animate={{ width: isOpen ? 280 : 72 }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
        className="h-full border-r border-border-light dark:border-border-dark flex flex-col flex-shrink-0"
      >
        {/* Header */}
        <div
          className={clsx(
            "flex items-center p-3 ",
            isOpen ? "justify-between" : "justify-center",
          )}
        >
          <AnimatePresence>
            {isOpen && (
              <motion.h2
                variants={textVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="font-bold text-text-light dark:text-text-dark whitespace-nowrap"
              >
                Chats
              </motion.h2>
            )}
          </AnimatePresence>
          <button
            data-testid="chat-sidebar-toggle"
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-full text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
          >
            {isOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 p-3">
          <button
            onClick={() => {
              handleClearChat();
              setActiveChatId(null);
            }}
            className={clsx(
              "flex items-center gap-3 p-2 rounded-md text-sm text-text-light dark:text-text-dark bg-tertiary-light dark:bg-tertiary-dark hover:bg-tertiary-light/80 dark:hover:bg-tertiary-dark/80 transition-colors",
              !isOpen && "justify-center",
            )}
          >
            <Plus size={18} />
            <AnimatePresence>
              {isOpen && (
                <motion.span
                  variants={textVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="whitespace-nowrap"
                >
                  New Chat
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Past Chats */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 no-scrollbar">
          {chats.map((chat) => (
            <div key={chat.id} className="relative">
              {/* ---- FIX: Changed from <button> to <div> and added accessibility attributes ---- */}
              <div
                data-testid="chat-list-item"
                onClick={() => selectChat(chat.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") selectChat(chat.id);
                }}
                role="button"
                tabIndex={0}
                className={clsx(
                  "w-full flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-info",
                  !isOpen && "justify-center",
                  activeChatId === chat.id
                    ? "bg-tertiary-light dark:bg-tertiary-dark text-dark1 dark:text-light1"
                    : "text-text-light-sub dark:text-text-dark-sub hover:bg-tertiary-light dark:hover:bg-tertiary-dark",
                )}
              >
                <MessageSquare size={18} />
                <AnimatePresence>
                  {isOpen && (
                    <motion.span
                      variants={textVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      className="whitespace-nowrap truncate flex-1 text-left text-sm"
                    >
                      {chat.title}
                    </motion.span>
                  )}
                </AnimatePresence>
                {/* ---- This <button> is now a valid child of the <div> ---- */}
                {isOpen && (
                  <div className="relative" ref={dropdownContainerRef}>
                    <button
                      onClick={(e) => toggleDropdown(chat.id, e)}
                      className="p-1 rounded hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors z-10"
                      aria-label="Chat options"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    <AnimatePresence>
                      {openDropdownId === chat.id && (
                        <motion.div
                          variants={dropdownVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 p-2 top-8 z-50 min-w-[150px] bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-md shadow-lg"
                        >
                          <button
                            onClick={(e) => handleRename(chat.id, e)}
                            className="w-full rounded-lg flex items-center gap-2 px-3 py-2 text-sm text-text-light dark:text-text-dark hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                          >
                            <Edit3 size={14} />
                            Rename
                          </button>
                          <button
                            onClick={(e) => handleDelete(chat.id, e)}
                            className="w-full rounded-lg flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-tertiary-light dark:hover:bg-tertiary-dark transition-colors"
                          >
                            <Trash2 size={14} />
                            Delete chat
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Rename Popup */}
      <AnimatePresence>
        {isRenameOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsRenameOpen(false)}
            className="fixed inset-0 flex items-center justify-center bg-black/50 z-50"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-light dark:bg-surface-dark p-6 rounded-lg shadow-xl w-80"
            >
              <h3 className="font-display text-lg font-semibold mb-4 text-text-light dark:text-text-dark">
                Rename Chat
              </h3>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRename();
                  if (e.key === "Escape") setIsRenameOpen(false);
                }}
                autoFocus
                className="w-full px-3 py-2 border rounded-md bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-info"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setIsRenameOpen(false)}
                  className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRename}
                  className="px-4 py-2 rounded-md bg-light1 dark:bg-dark1 text-white"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
