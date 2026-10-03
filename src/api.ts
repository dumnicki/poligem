import type { ChatMessage, Health } from "./types";

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