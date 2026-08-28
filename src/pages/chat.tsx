import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Sidebar } from "../components/chat/Sidebar";
import { chatService, type ChatMediaUploadResult } from "../api/chatService";
import type { SelectedModels } from "../types/Ollama";
import { useAuth } from "../hooks/useAuth";
import whisperService from "../api/whisperService";
import { LOADING_MESSAGES, STARTER_PROMPTS } from "../constants/chatConstants";
import { getGreeting } from "../utils/chatutils";
import { MessageList } from "../components/chat/MessageList";
import { ChatWelcome } from "../components/chat/ChatWelcome";
import { ChatInput } from "../components/chat/ChatInput";
import type { ChatPhase } from "../components/chat/LoadingBubble";
import type { StoredMessage, StoredMessageFile } from "../types/Chat";

// ---- TYPES ----
import type { Chat, Message, MessageFile } from "../types/Chat";
// ---- CORRECTED LINE: Use 'import type' for the ref interface ----
import type { ChatInputRef } from "../components/chat/ChatInput";
import ComingSoonPlaceholder from "../components/chat/ComingSoonPlaceholder";
import ImageLightbox from "../components/chat/ImageLightbox";
import PdfLightbox from "../components/chat/PdfLightbox";

const isFeatureEnabled = true;

/** What the app is actually doing, keyed by the phase the main process reports. */
const PHASE_LABELS: Record<ChatPhase, string> = {
  thinking: "Working out what you need…",
  searching: "Searching your entries…",
  writing: "Writing a response…",
};

export const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  /** Which stage of the pipeline is running, for the indicator's icon. */
  const [phase, setPhase] = useState<ChatPhase | null>(null);
  /**
   * Id of the message currently being written into, or null when idle.
   *
   * The streamed reply is a real entry in `messages` that gets rewritten on
   * each token rather than a separate bubble that is swapped out at the end:
   * swapping unmounts one element and mounts another, which replays the
   * entrance animation and makes the finished answer visibly blink.
   */
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const streamingIdRef = useRef<number | null>(null);
  const streamedTextRef = useRef("");
  /**
   * Identifies the generation this page is currently displaying. Held in a ref
   * so the stream listener can read it without resubscribing on every send,
   * and cleared when the user switches or clears a chat so that a reply still
   * arriving for the old conversation is dropped rather than rendered into the
   * new one.
   */
  const activeStreamId = useRef<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const { accessToken } = useAuth();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pdfLightbox, setPdfLightbox] = useState<{
    path: string;
    name?: string;
  } | null>(null);
  const [isSwitchingChats, setIsSwitchingChats] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [attachedPdf, setAttachedPdf] = useState<{
    file: File;
  } | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [model, setModel] = useState<string>("");
  const [greeting, setGreeting] = useState("");
  const chatInputRef = useRef<ChatInputRef>(null);

  useEffect(() => {
    const randomPrompt =
      STARTER_PROMPTS[Math.floor(Math.random() * STARTER_PROMPTS.length)];
    setPrompt(randomPrompt);
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const models =
          await window.electron.ipcRenderer.invoke<SelectedModels | null>(
            "models:get-selected",
          );
        if (models?.chat) setModel(models.chat);
        else console.error("[Chat] No chat model selected");
      } catch (err) {
        console.error("[Chat] Failed to load model settings:", err);
      }
    };
    fetchSettings();
    const user = localStorage.getItem("userInfo");
    const userName = user ? JSON.parse(user).full_name.split(" ")[0] : "User";
    setGreeting(getGreeting(userName));
  }, []);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const recentChats = await chatService.getChats(accessToken!, 1, 10);
        setChats(recentChats);
      } catch (err) {
        console.error("Failed to load chats:", err as Error);
      }
    };
    fetchChats();
  }, [accessToken]);

  /** Removes the in-progress reply, if any, and forgets it. */
  const discardStreamingMessage = useCallback(() => {
    const id = streamingIdRef.current;
    streamingIdRef.current = null;
    streamedTextRef.current = "";
    setStreamingId(null);
    if (id !== null) setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Generation progress. The reply takes two sequential model calls and only
  // the second one streams, so the phase events are what fill the first few
  // seconds - previously that gap was covered by loading captions that rotated
  // on a timer and described nothing that was actually happening.
  useEffect(() => {
    const unsubscribe = chatService.onStream((event) => {
      if (event.streamId !== activeStreamId.current) return;

      switch (event.type) {
        case "phase":
          setPhase(event.phase);
          setLoadingMessage(PHASE_LABELS[event.phase] ?? LOADING_MESSAGES[0]);
          break;

        case "delta": {
          streamedTextRef.current += event.text;
          const text = streamedTextRef.current;

          if (streamingIdRef.current === null) {
            // Negative so it can never collide with a database row id, which
            // is what the same message gets once it has been stored.
            const id = -Date.now();
            streamingIdRef.current = id;
            setStreamingId(id);
            setMessages((prev) => [...prev, { id, text, sender: "ai" }]);
          } else {
            const id = streamingIdRef.current;
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, text } : m)),
            );
          }
          break;
        }

        case "reset":
          // The model returned unparseable JSON and is being retried. Drop the
          // partial answer so the retry does not append to it.
          discardStreamingMessage();
          break;

        case "error":
          discardStreamingMessage();
          break;

        default:
          break;
      }
    });
    return unsubscribe;
  }, [discardStreamingMessage]);

  useEffect(() => {
    const unsubscribe = whisperService.onLiveData((data) => {
      if (data?.text) {
        chatInputRef.current?.appendText(data.text);
      }
    });
    return () => unsubscribe();
  }, []);

  const toggleLiveTranscription = async () => {
    if (isTranscribing) {
      await whisperService.stopLive();
      setIsTranscribing(false);
    } else {
      await whisperService.startLive();
      setIsTranscribing(true);
      chatInputRef.current?.focus();
    }
  };

  const handleSendMessage = async (inputValue: string) => {
    setIsLoading(true);
    setLoadingMessage("Sending message…");
    setPhase(null);
    streamingIdRef.current = null;
    streamedTextRef.current = "";
    setStreamingId(null);

    // Generated here rather than in the main process because the invoke only
    // resolves once the whole reply is finished - the id has to be known before
    // the first token arrives for the listener to be able to match it.
    const streamId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    activeStreamId.current = streamId;

    const userMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: "user",
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const result = await chatService.sendMessage(
        accessToken!,
        activeChatId,
        inputValue,
        model,
        [],
        [],
        streamId,
      );
      console.log(result, "aiRes");

      if ("error" in result) throw new Error(result.error);

      const { chatId: newChatId, messageId: newMessageId } = result;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === userMessage.id ? { ...m, id: newMessageId } : m,
        ),
      );

      if (!activeChatId && newChatId) {
        setActiveChatId(newChatId);
        const title =
          inputValue.length > 0 && inputValue.length < 20
            ? inputValue
            : (attachedImage?.file.name ?? "New Chat");
        setChats((prev) => [{ id: newChatId, title }, ...prev]);
      }

      if (attachedImage && newChatId && newMessageId) {
        setLoadingMessage("Uploading image...");
        const arrayBuffer = await attachedImage.file.arrayBuffer();
        const uploadResult =
          await window.electron.ipcRenderer.invoke<ChatMediaUploadResult>(
            "media:save-chat-media",
            {
              messageId: newMessageId,
              chatId: newChatId,
              filetype: "image",
              arrayBuffer,
              filename: attachedImage.file.name,
            },
          );
        if (!uploadResult?.success)
          throw new Error(uploadResult.message || "Failed to upload image.");
        await chatService.linkMediaToMessage(
          accessToken!,
          newMessageId,
          newChatId,
          uploadResult.key!,
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === newMessageId
              ? {
                  ...m,
                  files: [
                    ...(m.files || []),
                    { type: "image", url: attachedImage.previewUrl },
                  ],
                }
              : m,
          ),
        );
      }

      if (attachedPdf && newChatId && newMessageId) {
        setLoadingMessage("Uploading PDF...");
        const arrayBuffer = await attachedPdf.file.arrayBuffer();
        const uploadResult =
          await window.electron.ipcRenderer.invoke<ChatMediaUploadResult>(
            "media:save-chat-media",
            {
              messageId: newMessageId,
              chatId: newChatId,
              filetype: "pdf",
              arrayBuffer,
              filename: attachedPdf.file.name,
            },
          );
        if (!uploadResult?.success)
          throw new Error(uploadResult.message || "Failed to upload PDF.");
        await chatService.linkMediaToMessage(
          accessToken!,
          newMessageId,
          newChatId,
          uploadResult.key!,
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === newMessageId
              ? {
                  ...m,
                  files: [
                    ...(m.files || []),
                    {
                      type: "pdf",
                      url: "",
                      path: uploadResult.key,
                      name: attachedPdf.file.name,
                    },
                  ],
                }
              : m,
          ),
        );
      }

      setAttachedImage(null);
      setAttachedPdf(null);

      // Finalise the message that was being streamed rather than appending a
      // new one. The stored version is authoritative - only it carries the
      // sources and the follow-up prompt - but it is written into the existing
      // element, keeping its id so React updates in place instead of
      // remounting and replaying the entrance animation.
      const streamedId = streamingIdRef.current;
      const aiMessage: Message = {
        id: streamedId ?? result.aiMessageId ?? Date.now() + 1,
        text: result.aiRes.chatResponse.response,
        sender: "ai",
        followUpQuestion: result.aiRes.chatResponse.suggested_user_prompt,
        sources: result.aiRes.semanticResult,
      };

      streamingIdRef.current = null;
      streamedTextRef.current = "";
      setStreamingId(null);
      setMessages((prev) =>
        streamedId !== null
          ? prev.map((m) => (m.id === streamedId ? aiMessage : m))
          : [...prev, aiMessage],
      );
    } catch (err) {
      console.error("Error sending message:", err as Error);
      discardStreamingMessage();
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== userMessage.id),
        {
          id: Date.now(),
          text: `Failed to send message: ${(err as Error).message}`,
          sender: "ai",
        },
      ]);
    } finally {
      activeStreamId.current = null;
      setPhase(null);
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    // Disown any reply still generating: it belongs to the conversation being
    // left, and its remaining tokens must not land in the empty one.
    activeStreamId.current = null;
    discardStreamingMessage();
    setMessages([]);
    setActiveChatId(null);
    setAttachedImage(null);
    setAttachedPdf(null);
  };

  const handleSelectChat = async (chatId: number) => {
    if (chatId === activeChatId) return;
    activeStreamId.current = null;
    discardStreamingMessage();
    setActiveChatId(chatId);
    setIsLoading(true);
    setIsSwitchingChats(true);
    try {
      const chatData = await chatService.getChatById(accessToken!, chatId);
      if (chatData?.messages) {
        const formattedMessages: Message[] = await Promise.all(
          chatData.messages.map(async (m: StoredMessage) => {
            let files: MessageFile[] | undefined;
            if (m.files && m.files.length > 0) {
              files = await Promise.all(
                m.files.map(
                  async (f: StoredMessageFile): Promise<MessageFile> => {
                    if (f.file_type === "image") {
                      const base64: string =
                        await window.electron.ipcRenderer.invoke(
                          "media:get-image",
                          f.file_path,
                        );
                      return { type: "image", path: f.file_path, url: base64 };
                    }
                    return {
                      type: "pdf",
                      path: f.file_path,
                      url: "",
                      name: f.file_path.split(/[/\\]/).pop(),
                    };
                  },
                ),
              );
            }
            // Stored replies have the suggested next prompt appended to their
            // body as "Follow-up: ...". Re-reading an old conversation should
            // show the entries the answer drew on, not a stale prompt tacked
            // onto the prose, so that suffix is stripped back off here.
            const text =
              m.sender === "ai"
                ? String(m.content)
                    .replace(/\n{2,}Follow-up:[\s\S]*$/, "")
                    .trimEnd()
                : m.content;

            // The database returns flat rows; the bubble reads the Qdrant hit
            // shape that a live reply produces. Normalise so both paths render
            // through the same code.
            const sources = (m.sources || []).map((s) => ({
              id: String(s.id),
              payload: {
                title: s.source_title,
                source_type: s.source_type,
                source_id: s.source_id,
                goal_id: s.source_id,
              },
            }));

            return {
              id: m.id,
              text,
              sender: m.sender,
              files,
              sources: sources.length > 0 ? sources : undefined,
            };
          }),
        );
        setMessages(formattedMessages);
      }
    } catch (err) {
      console.error("Failed to load chat messages:", err);
      setMessages([
        {
          id: Date.now(),
          text: "Failed to load messages. Please try again.",
          sender: "ai",
        },
      ]);
    } finally {
      setIsSwitchingChats(false);
      setIsLoading(false);
    }
  };

  const handleDeleteChat = async (chatId: number) => {
    try {
      await chatService.deleteChat(accessToken!, chatId);
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
      if (chatId === activeChatId) handleClearChat();
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  const handleRenameChat = async (chatId: number, newTitle: string) => {
    try {
      await chatService.changeTitle(accessToken!, chatId, newTitle);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, title: newTitle } : chat,
        ),
      );
    } catch (error) {
      console.error("Failed to edit chat title:", error);
    }
  };

  const handlePdfOpen = async (path: string, name?: string) => {
    try {
      const dataUrl = await window.electron.ipcRenderer.invoke<string | null>(
        "media:get-pdf",
        path,
      );
      if (dataUrl) {
        setPdfDataUrl(dataUrl);
        setPdfLightbox({ path, name });
      }
    } catch (e) {
      console.error("Failed to load PDF", e);
    }
  };

  const handlePdfAttached = (file: File) => setAttachedPdf({ file });

  const handleImageAttached = (file: File) => {
    if (attachedImage) URL.revokeObjectURL(attachedImage.previewUrl);
    setAttachedImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleRemoveImage = () => {
    if (attachedImage) URL.revokeObjectURL(attachedImage.previewUrl);
    setAttachedImage(null);
  };

  const isChatEmpty = messages.length === 0 && !isLoading;

  return (
    <>
      <div className="flex h-full w-full bg-secondary-light dark:bg-secondary-dark">
        <Sidebar
          chats={chats}
          handleClearChat={handleClearChat}
          handleSelectChat={handleSelectChat}
          handleDeleteChat={handleDeleteChat}
          handleRenameChat={handleRenameChat}
        />
        <div className="flex-1 flex flex-col bg-secondary-light dark:bg-secondary-dark text-text-light dark:text-text-dark shadow-lg border border-border-light dark:border-border-dark overflow-hidden relative">
          {isFeatureEnabled ? (
            <>
              <MessageList
                messages={messages}
                streamingId={streamingId}
                phase={phase}
                isLoading={isLoading}
                isSwitchingChats={isSwitchingChats}
                loadingMessage={loadingMessage}
                onImageClick={setLightboxUrl}
                onPdfOpen={handlePdfOpen}
                onFollowUpClick={(question: string) => {
                  chatInputRef.current?.appendText(question);
                  chatInputRef.current?.focus();
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-10 bg-gradient-to-t from-secondary-light dark:from-secondary-dark to-transparent" />
              <motion.div
                layout
                animate={{
                  justifyContent: isChatEmpty ? "center" : "flex-end",
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="w-full flex flex-col absolute left-0 right-0 z-20"
                style={{
                  // Clears the floating dock, which is `absolute bottom-4` and
                  // roughly 64px tall (dock.tsx:262). At the previous 2.5rem the
                  // dock sat directly on top of the composer, covering the
                  // placeholder text and the send button.
                  bottom: isChatEmpty ? "50%" : "6.5rem",
                  transform: isChatEmpty ? "translateY(50%)" : "translateY(0)",
                }}
              >
                {isChatEmpty && (
                  <ChatWelcome greeting={greeting} prompt={prompt} />
                )}
                <ChatInput
                  ref={chatInputRef}
                  isLoading={isLoading}
                  isTranscribing={isTranscribing}
                  attachedImage={attachedImage}
                  attachedPdf={attachedPdf}
                  onSendMessage={handleSendMessage}
                  onToggleTranscription={toggleLiveTranscription}
                  onImageAttached={handleImageAttached}
                  onPdfAttached={handlePdfAttached}
                  onRemoveImage={handleRemoveImage}
                  onRemovePdf={() => setAttachedPdf(null)}
                />
              </motion.div>
            </>
          ) : (
            <ComingSoonPlaceholder />
          )}
        </div>
      </div>
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {pdfLightbox && (
        <PdfLightbox
          name={pdfLightbox.name}
          path={pdfLightbox.path}
          dataUrl={pdfDataUrl}
          onClose={() => {
            setPdfLightbox(null);
            setPdfDataUrl(null);
          }}
        />
      )}
    </>
  );
};
