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

export type ExerciseType = "en2pl" | "pl2en" | "cloze";

export type Exercise = {
  type: ExerciseType;
  prompt: string;
  answer: string;
  explanation?: string;
};

export type ExerciseSet = {
  source: "generated" | "seed";
  type: ExerciseType;
  exercises: Exercise[];
};

export type Attempt = {
  type: ExerciseType;
  prompt: string;
  answer: string;
  correct: boolean;
  at: number;
};