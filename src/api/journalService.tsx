import api from "./axios";

export interface JournalEntry {
  id?: number;
  title: string;
  content: string;
  mood_score?: number;
  sentiment_score?: number;
  mood_tags?: string[];
  created_at?: string;
  image_key?: string;
  audio_key?: string;
}

const getAll = () => api.get<JournalEntry[]>("/journals");
const getOne = (id: number) => api.get<JournalEntry>(`/journals/${id}`);
const create = (data: JournalEntry) => api.post("/journals", data);
const update = (id: number, data: JournalEntry) => api.put(`/journals/${id}`, data);
const remove = (id: number) => api.delete(`/journals/${id}`);
const getMoodRange = (range: number) => api.get(`/journals/mood_score/${range}`)
const getUploadUrl = (type: string, userId: string, postId: string) => api.get(`/journals/upload?type=${type}&userId=${userId}&postId=${postId}`)
const getMediaUrl = (key: string) => api.get(`/journals/media/${encodeURIComponent(key)}`);

export default { getAll, getOne, create, update, remove, getMoodRange, getUploadUrl, getMediaUrl };
