import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getNextExercise, reportAnswer } from "../api";
import { grade, type Verdict } from "../grade";
import {
  allAttempts,
  computeStats,
  recordAttempt,
  weakPrompts,
  type Stats,
} from "../store";
import type { Exercise, ExerciseType } from "../types";

const TYPES: { id: ExerciseType; label: string }[] = [
  { id: "en2pl", label: "English → Polish" },
  { id: "pl2en", label: "Polish → English" },
  { id: "cloze", label: "Fill the gap" },
];

type Loaded = { exercise: Exercise; source: "generated" | "seed" };

export default function Exercises() {
  const [type, setType] = useState<ExerciseType>("en2pl");
  const [current, setCurrent] = useState<Loaded | null>(null);
  const [next, setNext] = useState<Loaded | null>(null);
  const [value, setValue] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [served, setServed] = useState(0);

  // Guards against a slow in-flight response overwriting a newer selection.
  const requestId = useRef(0);

  const pull = useCallback(
    async (t: ExerciseType): Promise<Loaded | null> => {
      const id = ++requestId.current;
      try {
        const data = await getNextExercise(t);
        if (id !== requestId.current) return null; // superseded
        return { exercise: data.exercise, source: data.source };
      } catch (err) {
        if (id === requestId.current) setError((err as Error).message);
        return null;
      }
    },
    [],
  );

  // Load the first exercise and buffer the next one in the same pass, so
  // pressing Next never shows a spinner.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setValue("");
    setVerdict(null);
    setRevealed(false);

    void (async () => {
      const first = await pull(type);
      if (cancelled || !first) return;
      setCurrent(first);
      setServed((n) => n + 1);

      const buffered = await pull(type);
      if (!cancelled && buffered) setNext(buffered);
    })();

    return () => {
      cancelled = true;
    };
  }, [type, pull]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!current || revealed || !value.trim()) return;

    const result = grade(current.exercise.answer, value);
    const ok = result !== "wrong";
    setVerdict(result);
    setRevealed(true);

    recordAttempt({
      type: current.exercise.type,
      prompt: current.exercise.prompt,
      answer: current.exercise.answer,
      correct: ok,
    });
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    setStats(computeStats(allAttempts()));

    // Tell the server what was missed so it refills with targeted material.
    void reportAnswer(current.exercise.prompt, ok);
  }

  /** Advances to the buffered exercise, then refills the buffer. */
  function advance() {
    if (!next) {
      void pull(type).then((item) => {
        if (item) {
          setCurrent(item);
          setServed((n) => n + 1);
        }
      });
    } else {
      setCurrent(next);
      setNext(null);
      setServed((n) => n + 1);
    }
    setValue("");
    setVerdict(null);
    setRevealed(false);

    // Keep one ahead. The pool is warm, so this resolves immediately.
    void pull(type).then((item) => setNext(item));
  }

  const exercise = current?.exercise ?? null;

  return (
    <>
      <div className="panel-head">
        <h2>Exercises</h2>
        <div className="head-right">
          {current && (
            <span className="badge-src">
              {current.source === "generated" ? "gemma3" : "built-in"}
            </span>
          )}
        </div>
      </div>

      <div className="type-tabs">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={type === t.id ? "active" : ""}
            onClick={() => setType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="exercise-body">
        {error && <p className="muted">Could not load an exercise: {error}</p>}

        {!exercise && !error && <p className="muted">Loading…</p>}

        {exercise && (
          <>
            <div className="progress-line">
              <span>#{served}</span>
              <span className="score">
                ✓ {score.right} · ✗ {score.wrong}
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
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={revealed}
                placeholder={
                  exercise.type === "pl2en" ? "Write it in English…" : "Twoja odpowiedź…"
                }
                autoFocus
              />
              {revealed ? (
                <button type="button" onClick={advance}>
                  Next
                </button>
              ) : (
                <button type="submit" disabled={!value.trim()}>
                  Check
                </button>
              )}
            </form>

            {revealed && (
              <div className={`feedback ${verdict ?? "wrong"}`}>
                <p>
                  {verdict === "correct" && "Dobrze! "}
                  {verdict === "close" && "Prawie — "}
                  {verdict === "wrong" && "Poprawna odpowiedź: "}
                  <strong>{exercise.answer}</strong>
                </p>
                {exercise.explanation && (
                  <p className="explain">{exercise.explanation}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {stats && stats.total > 0 && (
        <p className="muted foot">
          Overall {Math.round((stats.accuracy ?? 0) * 100)}% over {stats.total} answers.
          {weakPrompts().length > 0 && " Practising your weak spots."}
        </p>
      )}
    </>
  );
}