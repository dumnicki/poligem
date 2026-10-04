import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getNextExercise, reportAnswer } from "../api";
import { grade, type Verdict } from "../grade";
import { allAttempts, computeStats, recordAttempt, type Stats } from "../store";
import type { Exercise, ExerciseType } from "../types";

const TYPES: { id: ExerciseType; label: string }[] = [
  { id: "en2pl", label: "English → Polish" },
  { id: "pl2en", label: "Polish → English" },
  { id: "cloze", label: "Fill the gap" },
];

const ALL: ExerciseType[] = TYPES.map((t) => t.id);

type Loaded = { exercise: Exercise; source: "generated" | "seed" };

/**
 * Per-exercise-type panel state.
 *
 * Each type keeps its own exercise, buffered next one, input, verdict and
 * counter. Without this, switching type threw away an unsolved exercise and the
 * shared counter climbed on every switch. State survives type switches and tab
 * switches (all panels stay mounted).
 */
type Panel = {
  current: Loaded | null;
  next: Loaded | null;
  value: string;
  verdict: Verdict | null;
  revealed: boolean;
  served: number;
  error: string | null;
};

const blank: Panel = {
  current: null,
  next: null,
  value: "",
  verdict: null,
  revealed: false,
  served: 0,
  error: null,
};

export default function Exercises() {
  const [type, setType] = useState<ExerciseType>("en2pl");
  const [panels, setPanels] = useState<Record<ExerciseType, Panel>>({
    en2pl: blank,
    pl2en: blank,
    cloze: blank,
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [totals, setTotals] = useState({ right: 0, wrong: 0 });

  // Mirrors of panel state, so async pulls can read the latest value without
  // being re-created (and re-triggering effects) on every keystroke.
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  const patch = useCallback((t: ExerciseType, p: Partial<Panel>) => {
    setPanels((prev) => ({ ...prev, [t]: { ...prev[t], ...p } }));
  }, []);

  /**
   * Ensures a type has an exercise on screen plus one buffered, so pressing
   * Next never shows a spinner. Never overwrites an unsolved exercise.
   */
  const ensureLoaded = useCallback(
    async (t: ExerciseType) => {
      const snapshot = panelsRef.current[t];
      if (snapshot.current) {
        // Already showing one; just top up the buffer if it's missing.
        if (!snapshot.next) {
          const buffered = await getNextExercise(t).catch(() => null);
          if (buffered) patch(t, { next: { exercise: buffered.exercise, source: buffered.source } });
        }
        return;
      }

      const first = await getNextExercise(t).catch((err: Error) => {
        patch(t, { error: err.message });
        return null;
      });
      if (!first) return;

      patch(t, {
        current: { exercise: first.exercise, source: first.source },
        error: null,
        served: panelsRef.current[t].served + 1,
      });

      const buffered = await getNextExercise(t).catch(() => null);
      if (buffered) patch(t, { next: { exercise: buffered.exercise, source: buffered.source } });
    },
    [patch],
  );

  // Warm every type once on mount, so switching type is instant. A ref guard
  // keeps StrictMode's double-invoke from consuming two exercises per type.
  const warmed = useRef(false);
  useEffect(() => {
    if (warmed.current) return;
    warmed.current = true;
    for (const t of ALL) void ensureLoaded(t);
  }, [ensureLoaded]);

  const panel = panels[type];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!panel.current || panel.revealed || !panel.value.trim()) return;

    const result = grade(panel.current.exercise.answer, panel.value);
    const ok = result !== "wrong";
    patch(type, { verdict: result, revealed: true });

    recordAttempt({
      type: panel.current.exercise.type,
      prompt: panel.current.exercise.prompt,
      answer: panel.current.exercise.answer,
      correct: ok,
    });
    setTotals((t) => ({ right: t.right + (ok ? 1 : 0), wrong: t.wrong + (ok ? 0 : 1) }));
    setStats(computeStats(allAttempts()));

    // Tell the server what was missed so it refills with targeted material.
    void reportAnswer(panel.current.exercise.prompt, ok);
  }

  /** Only reachable after grading, so the current exercise is always consumed. */
  function advance() {
    const reset = { value: "", verdict: null, revealed: false } as const;

    if (panel.next) {
      patch(type, {
        ...reset,
        current: panel.next,
        next: null,
        served: panel.served + 1,
      });
      // Refill the buffer for this type; the pool is warm so it lands at once.
      void getNextExercise(type)
        .then((data) =>
          patch(type, { next: { exercise: data.exercise, source: data.source } }),
        )
        .catch(() => undefined);
      return;
    }

    // Buffer was empty. Promote a freshly fetched exercise to `current`, or the
    // panel would sit on "Loading…" with nothing scheduled to fill it.
    patch(type, reset);
    void getNextExercise(type)
      .then((data) =>
        patch(type, {
          current: { exercise: data.exercise, source: data.source },
          served: panel.served + 1,
        }),
      )
      .catch((err: Error) => patch(type, { error: err.message }));
  }

  const exercise = panel.current?.exercise ?? null;

  return (
    <>
      <div className="panel-head">
        <h2>Exercises</h2>
        <div className="head-right">
          {panel.current && (
            <span className={`badge-src ${panel.current.source}`}>
              {panel.current.source === "generated" ? "gemma3" : "built-in"}
            </span>
          )}
        </div>
      </div>

      <div className="type-tabs">
        {TYPES.map((t) => {
          const p = panels[t.id];
          const done = p.revealed;
          return (
            <button
              key={t.id}
              className={type === t.id ? "active" : ""}
              onClick={() => setType(t.id)}
              title={done ? "Answered — press Next to continue" : "In progress"}
            >
              {t.label}
              {done && <span className="tick">•</span>}
            </button>
          );
        })}
      </div>

      <div className="exercise-body">
        {panel.error && <p className="muted">Could not load an exercise: {panel.error}</p>}

        {!exercise && !panel.error && <p className="muted">Loading…</p>}

        {exercise && (
          <>
            <div className="progress-line">
              <span>#{panel.served}</span>
              <span className="score">
                ✓ {totals.right} · ✗ {totals.wrong}
              </span>
            </div>

            <div className="prompt-card">
              <p className="prompt-text">{exercise.prompt}</p>
              {exercise.type === "cloze" && (
                <p className="hint">Type the missing word only.</p>
              )}
            </div>

            <form onSubmit={submit} className="exercise-form">
              <input
                value={panel.value}
                onChange={(e) => patch(type, { value: e.target.value })}
                disabled={panel.revealed}
                placeholder={
                  exercise.type === "pl2en" ? "Write it in English…" : "Twoja odpowiedź…"
                }
              />
              {panel.revealed ? (
                <button type="button" onClick={advance}>
                  Next
                </button>
              ) : (
                <button type="submit" disabled={!panel.value.trim()}>
                  Check
                </button>
              )}
            </form>

            {panel.revealed && (
              <div className={`feedback ${panel.verdict ?? "wrong"}`}>
                <p>
                  {panel.verdict === "correct" && "Dobrze! "}
                  {panel.verdict === "close" && "Prawie — "}
                  {panel.verdict === "wrong" && "Poprawna odpowiedź: "}
                  <strong>{exercise.answer}</strong>
                </p>
                {exercise.explanation && <p className="explain">{exercise.explanation}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {stats && stats.total > 0 && (
        <p className="muted foot">
          Overall {Math.round((stats.accuracy ?? 0) * 100)}% over {stats.total} answers.
        </p>
      )}
    </>
  );
}