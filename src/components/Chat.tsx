import { useEffect, useRef, useState, type FormEvent } from "react";
import { getScenario, streamChat, translate } from "../api";
import type { Level } from "../../shared/levels";
import type { ChatMessage } from "../types";

const SUGGESTIONS = ["Cześć, jak się masz?", "Poproszę kawę.", "Co to znaczy?"];

export default function Chat({ level }: { level: Level }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingScenario, setLoadingScenario] = useState(true);
  const [translations, setTranslations] = useState<Record<number, string>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  // Open a scenario on mount so the learner never faces a blank page.
  useEffect(() => {
    let cancelled = false;
    getScenario(level)
      .then(({ text }) => {
        if (!cancelled) setMessages([{ role: "assistant", content: text }]);
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([
            {
              role: "assistant",
              content:
                "Hej! Jestem twoim polskim rozmówcą. Napisz do mnie po polsku, a poprawię cię po cichu.",
            },
          ]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingScenario(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      for await (const piece of streamChat(next, level, controller.signal)) {
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

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  async function newScenario() {
    if (busy) return;
    abortRef.current?.abort();
    setLoadingScenario(true);
    setTranslations({});
    setInput("");
    try {
      const { text } = await getScenario(level);
      setMessages([{ role: "assistant", content: text }]);
    } catch {
      setMessages([
        { role: "assistant", content: "Nie udało się wczytać sytuacji. Spróbujmy jeszcze raz." },
      ]);
    } finally {
      setLoadingScenario(false);
      setBusy(false);
    }
  }

  async function toggleTranslation(index: number, polish: string) {
    if (translations[index]) {
      setTranslations((t) => {
        const next = { ...t };
        delete next[index];
        return next;
      });
      return;
    }
    try {
      const { english } = await translate(polish);
      setTranslations((t) => ({ ...t, [index]: english }));
    } catch {
      setTranslations((t) => ({ ...t, [index]: "— translation unavailable —" }));
    }
  }

  return (
    <>
      <div className="panel-head">
        <h2>Conversation</h2>
        <button
          onClick={newScenario}
          disabled={busy || loadingScenario}
          className="reset"
        >
          {loadingScenario ? "Preparing…" : "New situation"}
        </button>
      </div>

      <div className="thread">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <span className="who">{m.role === "user" ? "you" : "poligem"}</span>
            <p>{m.content}</p>
            {m.role === "assistant" && m.content && (
              <>
                <button
                  className="translate-btn"
                  onClick={() => void toggleTranslation(i, m.content)}
                  disabled={busy}
                >
                  {translations[i] ? "Hide English" : "EN"}
                </button>
                {translations[i] && <p className="translation">{translations[i]}</p>}
              </>
            )}
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
            <button className="translate-btn" onClick={stop}>
              Stop
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => void send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Napisz po polsku…"
          disabled={busy}
        />
        {busy ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </>
  );
}