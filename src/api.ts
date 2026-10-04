import type { ChatMessage, Exercise, ExerciseType, Health } from "./types";

export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  return res.json();
}

/**
 * Streams the tutor reply token by token.
 *
 * Ollama returns newline-delimited JSON; a chunk boundary can land mid-line, so
 * we buffer the remainder and only parse complete lines.
 */
export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(detail.error ?? `Server responded ${res.status}`);
  }
  if (!res.body) throw new Error("Response had no body");

  const reader = res.body.getReader();
  // Explicit UTF-8: Polish diacritics must not be decoded as latin-1.
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        const piece: string | undefined = parsed?.message?.content;
        if (piece) yield piece;
      } catch {
        // incomplete line — will be re-parsed on the next chunk
      }
    }
  }
}

/**
 * The server keeps a pool of ready exercises, so these return from memory
 * instead of waiting on the model. `/api/exercise/next` is a pool take;
 * `/api/exercise/report` lets the server learn which prompts the learner misses
 * so it can refill with targeted material.
 */
export async function getNextExercise(type: ExerciseType): Promise<{
  exercise: Exercise;
  source: "generated" | "seed";
  depth: number;
}> {
  const res = await fetch(`/api/exercise/next?type=${encodeURIComponent(type)}`);
  const data = await res.json();
  if (!data?.exercise) throw new Error(data?.error ?? `No exercise for ${type}`);
  return data;
}

export async function reportAnswer(prompt: string, correct: boolean): Promise<void> {
  try {
    await fetch("/api/exercise/report", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ prompt, correct }),
    });
  } catch {
    // Reporting is an optimisation, not a requirement — never surface a failure.
  }
}