/** A retrieved journal/goal hit that an answer was grounded in. */
export interface MessageSource {
  id: string;
  payload: {
    title?: string;
    source_type?: string;
    source_id?: string | number;
    goal_id?: string | number;
    [key: string]: unknown;
  };
}

/** A message row as stored in SQLite, before it is shaped into a Message. */
export interface StoredMessageFile {
  file_type: "image" | "pdf" | "audio";
  file_path: string;
}

export interface StoredMessageSource {
  id: number;
  source_type: string;
  source_id: string;
  source_title?: string;
}

export interface StoredMessage {
  id: number;
  content: string;
  sender: "user" | "ai";
  files?: StoredMessageFile[];
  sources?: StoredMessageSource[];
}

/** What `chat:get-by-id` resolves with. */
export interface ChatDetail {
  id: number;
  title: string;
  messages?: StoredMessage[];
}

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
  sources?: MessageSource[];
}

export interface Chat {
  id: number;
  title: string;
}
