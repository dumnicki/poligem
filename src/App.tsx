import { useEffect, useState } from "react";
import { getHealth } from "./api";
import Chat from "./components/Chat";
import Exercises from "./components/Exercises";
import Progress from "./components/Progress";
import type { Health } from "./types";

type Tab = "chat" | "exercises" | "progress";

const TABS: { id: Tab; icon: string; label: string; hint: string }[] = [
  { id: "chat", icon: "💬", label: "Chat", hint: "Free conversation" },
  { id: "exercises", icon: "✎", label: "Exercises", hint: "Structured practice" },
  { id: "progress", icon: "◔", label: "Progress", hint: "What you keep missing" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() =>
        setHealth({ ok: false, model: "-", error: "Cannot reach the poligem server" }),
      );
  }, []);

  const modelMissing = health?.ok && health.modelPresent === false;

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="logo">
          <span className="dotmark" />
          poligem
        </div>

        <div className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "nav-item active" : "nav-item"}
              onClick={() => setTab(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              <span className="nav-text">
                <span className="nav-label">{t.label}</span>
                <span className="nav-hint">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="side-foot">
          {health === null ? (
            <span className="dot checking">checking…</span>
          ) : health.ok ? (
            <span className="dot ok" title={`Ollama on ${health.model}`}>
              {health.model}
              {modelMissing ? " · not pulled" : ""}
            </span>
          ) : (
            <span className="dot bad" title={health.error}>
              offline
            </span>
          )}
          <span className="side-note">runs entirely on your machine</span>
        </div>
      </nav>

      <main className="content">
        {modelMissing && (
          <div className="banner">
            Model <code>{health?.model}</code> isn&apos;t installed. Run{" "}
            <code>ollama pull {health?.model}</code>.
          </div>
        )}
        {/*
          All three panels stay mounted; only visibility toggles. Switching tabs
          therefore preserves the chat transcript, the generated exercise queue,
          and in-progress drill state, instead of regenerating ~25s of exercises
          every time the user glances at their progress.
        */}
        <div className="panel" hidden={tab !== "chat"}>
          <Chat />
        </div>
        <div className="panel" hidden={tab !== "exercises"}>
          <Exercises />
        </div>
        <div className="panel" hidden={tab !== "progress"}>
          <Progress />
        </div>
      </main>
    </div>
  );
}