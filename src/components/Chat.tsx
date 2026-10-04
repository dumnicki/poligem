import { useEffect, useRef, useState, type FormEvent } from "react";
import { getScenario, streamChat, translate } from "../api";
import type { Level } from "../../shared/levels";
import {
  FALLBACK_INTRO,
  GREETING,
  SCENARIO_FAILED,
  STARTER_PROMPTS,
} from "../../shared/copy";
import type { ChatMessage } from "../types";

export default function Chat({ level }: { level: Level }) {
  // Start with the static greeting so the panel is never empty, then let the
  // generated scenario replace it. Generating first meant a ~30s blank wait.
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingScenario, setLoadingScenario] = useState(true);
  // Translations are cached permanently and never dropped, so re-opening one
  // costs nothing. `shown` only tracks which are currently visible.
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const [translating, setTranslating] = useState<Record<number, boolean>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * True once the in-flight reply has produced its first token.
   *
   * Derived rather than stored, so it cannot drift out of sync with the
   * messages it describes.
   */
  const last = messages[messages.length - 1];
  const hasStreamed = busy && !!last?.content;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  // Generate a scenario on mount, but leave the static greeting on screen while
  // it runs. The panel is readable immediately and upgrades itself when ready.
  //
  // The scenario is APPENDED, not substituted: the greeting is the first thing
  // the learner reads, so replacing it would pull text out from under them.
  useEffect(() => {
    let cancelled = false;
    getScenario(level)
      .then(({ text }) => {
        if (cancelled || !text) return;
        setMessages((prev) => [...prev, { role: "assistant", content: text }]);
      })
      .catch(() => {
        // Keep the greeting; it is a perfectly good fallback.
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

    // The learner has taken over the conversation; drop the openers.
    setShown({});
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  /**
   * Starts a fresh scenario.
   *
   * The greeting is deliberately dropped here — unlike the automatic load on
   * mount, this is an explicit "start over", so keeping a welcome message from
   * the previous round would just be noise.
   */
  async function newScenario() {
    if (busy) return;
    abortRef.current?.abort();
    setLoadingScenario(true);
    setTranslations({});
    setShown({});
    setInput("");
    setMessages([]);
    try {
      const { text } = await getScenario(level);
      setMessages([{ role: "assistant", content: text }]);
    } catch {
      setMessages([{ role: "assistant", content: SCENARIO_FAILED }]);
    } finally {
      setLoadingScenario(false);
      setBusy(false);
    }
  }

  /**
   * Shows or hides the English translation.
   *
   * The cached string is kept when hidden, so re-opening is instant and costs
   * no model call. Only a first open per message actually translates.
   */
  function toggleTranslation(index: number, polish: string) {
    if (shown[index]) {
      setShown((s) => ({ ...s, [index]: false }));
      return;
    }

    setShown((s) => ({ ...s, [index]: true }));

    if (translations[index] || translating[index]) return;

    setTranslating((t) => ({ ...t, [index]: true }));
    translate(polish)
      .then(({ english }) => setTranslations((t) => ({ ...t, [index]: english })))
      .catch(() => setTranslations((t) => ({ ...t, [index]: "— translation unavailable —" })))
      .finally(() => setTranslating((t) => ({ ...t, [index]: false })));
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
          <div key={i} className={`msg ${m.role} ${!m.content ? "pending" : ""}`}>
            {/*
              No label for an empty placeholder: the thinking indicator below
              already carries the "poligem" attribution, and two of them stacked
              read as two speakers.
            */}
            {m.content && (
              <span className="who">{m.role === "user" ? "you" : "poligem"}</span>
            )}
            {/*
              While a reply streams in, its bubble is still empty. Giving it a
              border and padding renders a second, empty box right above the
              thinking indicator, so the placeholder is borderless until there
              is actually text to show.
            */}
            {m.content ? (
              <p>{m.content}</p>
            ) : (
              <p className="placeholder" aria-hidden="true" />
            )}
            {m.role === "assistant" && m.content && (
              <>
                <button
                  className="translate-btn"
                  onClick={() => toggleTranslation(i, m.content)}
                  disabled={busy || translating[i]}
                  aria-busy={translating[i] || undefined}
                >
                  {translating[i] ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Translating…
                    </>
                  ) : shown[i] ? (
                    "Hide English"
                  ) : (
                    "EN"
                  )}
                </button>
                {shown[i] && translating[i] && (
                  <p className="translation pending">Translating…</p>
                )}
                {shown[i] && !translating[i] && translations[i] && (
                  <p className="translation">{translations[i]}</p>
                )}
              </>
            )}
          </div>
        ))}

        {/*
          Thinking dots only until the first token arrives. The last message is
          the placeholder while the reply streams, so once it has text there is
          nothing to indicate — the text itself is the progress.
        */}
        {busy && !hasStreamed && (
          <div className="msg assistant">
            <span className="who">poligem</span>
            <p className="thinking">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}

        {/* Stop stays available for the whole reply, dots or not. */}
        {busy && hasStreamed && (
          <div className="msg assistant stop-row">
            <button className="translate-btn" onClick={stop}>
              Stop
            </button>
          </div>
        )}

        {/*
          The scenario indicator sits below the conversation, because that is
          where the generated scenario will appear — the greeting stays above it
          as the intro. Rendering it first put the dots above their own result.
        */}
        {loadingScenario && (
          <div className="msg assistant">
            <span className="who">poligem</span>
            <p className="thinking" aria-label="Preparing a situation">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Openers only while the conversation is still new; they stop making
          sense once the learner has started their own scenario. */}
      {messages.length <= 1 && !loadingScenario && (
        <div className="suggestions">
          {STARTER_PROMPTS.map((s) => (
            <button key={s} onClick={() => void send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

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