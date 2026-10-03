export type Role = "user" | "assistant";

export type ChatMessage = {
  role: Role;
  content: string;
};

export type Health = {
  ok: boolean;
  model: string;
  modelPresent?: boolean;
  models?: string[];
  error?: string;
};