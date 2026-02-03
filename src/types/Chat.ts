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
  sources?: Array<any>;
}

export interface Chat {
  id: number;
  title: string;
}
