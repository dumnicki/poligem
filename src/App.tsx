import { useEffect, useRef, useState } from "react";
import { getHealth, streamChat } from "./api";
import type { ChatMessage, Health } from "./types";

const GREETING =
  "Cześć! Jestem twoim polskim rozmówcą. Napisz do mnie po polsku — poprawię cię po cichu, kiedy trzeba. Zaczynamy?";

const SUGGESTIONS = [
  "Cześć, jak się masz?",
  "Idę dziś do kawiarni.",
  "Nie rozumiem, możesz powtórzyć?",
];

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() =>
        setHealth({ ok: false, model: "-", error: "Cannot reach the poligem server" }),
      );
  }, []);

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

  const modelMissing = health?.ok && health.modelPresent === false;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          poligem
          <span className="tagline">Polish conversation practice</span>
        </div>
        <div className="status">
          {health === null ? (
            <span className="dot checking">checking…</span>
          ) : health.ok ? (
            <span className="dot ok">
              {health.model}
              {modelMissing ? " · not pulled" : " · ready"}
            </span>
          ) : (
            <span className="dot bad" title={health.error}>
              offline
            </span>
          )}
          <button onClick={reset} className="reset">
            New conversation
          </button>
        </div>
      </header>

      {modelMissing && (
        <div className="banner">
          Model <code>{health?.model}</code> isn&apos;t installed. Run{" "}
          <code>ollama pull {health?.model}</code>.
        </div>
      )}

      <main className="thread">
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
      </main>

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
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}