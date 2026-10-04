import { useState } from "react";
import { allAttempts, clearAttempts, computeStats, weakPrompts } from "../store";
import type { ExerciseType } from "../types";

const LABELS: Record<ExerciseType, string> = {
  en2pl: "English → Polish",
  pl2en: "Polish → English",
  cloze: "Fill the gap",
};

export default function Progress() {
  const [nonce, setNonce] = useState(0);
  const attempts = allAttempts();
  const stats = computeStats(attempts);
  const weak = weakPrompts(10);

  return (
    <>
      <div className="panel-head">
        <h2>Progress</h2>
        {stats.total > 0 && (
          <button
            className="reset"
            onClick={() => {
              clearAttempts();
              setNonce((n) => n + 1);
            }}
          >
            Reset
          </button>
        )}
      </div>

      <div className="progress-body" key={nonce}>
        {stats.total === 0 ? (
          <p className="muted">
            Nothing here yet. Answer a few exercises and your accuracy will show up.
          </p>
        ) : (
          <>
            <div className="stat-row">
              <div className="stat">
                <span className="value">{stats.total}</span>
                <span className="label">answered</span>
              </div>
              <div className="stat">
                <span className="value">
                  {Math.round((stats.accuracy ?? 0) * 100)}%
                </span>
                <span className="label">accuracy</span>
              </div>
              <div className="stat">
                <span className="value">{stats.correct}</span>
                <span className="label">correct</span>
              </div>
            </div>

            <h3>By exercise</h3>
            <div className="bars">
              {(Object.keys(LABELS) as ExerciseType[])
                .filter((t) => stats.byType[t].total > 0)
                .map((t) => {
                  const { total, correct } = stats.byType[t];
                  const pct = Math.round((correct / total) * 100);
                  return (
                    <div key={t} className="bar-row">
                      <span className="bar-label">{LABELS[t]}</span>
                      <span className="bar">
                        <span
                          className={`fill ${pct >= 70 ? "good" : pct >= 40 ? "mid" : "low"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="bar-pct">
                        {correct}/{total}
                      </span>
                    </div>
                  );
                })}
            </div>

            {weak.length > 0 && (
              <>
                <h3>Needs work</h3>
                <p className="muted">
                  Missed twice or more. poligem feeds these back into generated
                  exercises.
                </p>
                <ul className="weak-list">
                  {weak.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            )}

            <h3>Recent</h3>
            <ul className="recent-list">
              {stats.recent.map((a, i) => (
                <li key={i} className={a.correct ? "ok" : "bad"}>
                  <span className="mark">{a.correct ? "✓" : "✗"}</span>
                  <span className="what">{a.prompt}</span>
                  {!a.correct && <span className="right">{a.answer}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}