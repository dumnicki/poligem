import type { Attempt, ExerciseType } from "./types";

const KEY = "poligem.attempts.v1";

function read(): Attempt[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Attempt[]) : [];
  } catch {
    // corrupt or unavailable storage (private mode) — start clean, never crash
    return [];
  }
}

function write(attempts: Attempt[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(attempts.slice(-500)));
  } catch {
    // quota or private mode — history is a nicety, not a requirement
  }
}

export function recordAttempt(a: Omit<Attempt, "at">): Attempt[] {
  const attempt: Attempt = { ...a, at: Date.now() };
  const next = [...read(), attempt];
  write(next);
  return next;
}

export function allAttempts(): Attempt[] {
  return read();
}

export function clearAttempts() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Prompts answered wrong at least twice — fed back into generation. */
export function weakPrompts(limit = 8): string[] {
  const misses = new Map<string, number>();
  for (const a of read()) {
    if (a.correct) continue;
    misses.set(a.prompt, (misses.get(a.prompt) ?? 0) + 1);
  }
  return [...misses.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([prompt]) => prompt);
}

export type Stats = {
  total: number;
  correct: number;
  accuracy: number | null;
  byType: Record<ExerciseType, { total: number; correct: number }>;
  recent: Attempt[];
};

const TYPES: ExerciseType[] = ["en2pl", "pl2en", "cloze"];

export function computeStats(attempts: Attempt[]): Stats {
  const byType = Object.fromEntries(
    TYPES.map((t) => [t, { total: 0, correct: 0 }]),
  ) as Record<ExerciseType, { total: number; correct: number }>;

  let correct = 0;
  for (const a of attempts) {
    byType[a.type].total++;
    if (a.correct) {
      byType[a.type].correct++;
      correct++;
    }
  }

  return {
    total: attempts.length,
    correct,
    accuracy: attempts.length ? correct / attempts.length : null,
    byType,
    recent: [...attempts].slice(-12).reverse(),
  };
}