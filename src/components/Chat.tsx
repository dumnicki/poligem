import { useEffect, useRef, useState } from "react";
import { streamChat } from "../api";
import type { ChatMessage } from "../types";

const GREETING =
  "Cześć! Jestem twoim polskim rozmówcą. Napisz do mnie po polsku — poprawię cię po cichu, kiedy trzeba. Zaczynamy?";

const SUGGESTIONS = [
  "Cześć, jak się masz?",
  "Idę dziś do kawiarni.",
  "Nie rozumiem, możesz powtórzyć?",
];

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const piece of streamChat(next, controller.signal)) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + piece };
          return copy;
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = {
            ...last,
            content: last.content || `⚠️ ${(err as Error).message}`,
          };
          return copy;
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([{ role: "assistant", content: GREETING }]);
    setInput("");
  }

  return (
    <>
      <div className="panel-head">
        <h2>Conversation</h2>
        <button onClick={reset} className="reset">
          New conversation
        </button>
      </div>

      <div className="thread">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <span className="who">{m.role === "user" ? "you" : "poligem"}</span>
            <p>{m.content}</p>
          </div>
        ))}

        {busy && (
          <div className="msg assistant">
            <span className="who">poligem</span>
            <p className="thinking">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Napisz po polsku…"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>
    </>
  );
}