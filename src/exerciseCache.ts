import { fetchExercises } from "./api";
import type { Exercise, ExerciseType } from "./types";

/**
 * In-memory exercise cache, module-scoped so it survives tab switches (all
 * panels stay mounted) and is shared by every caller.
 *
 * Three behaviours matter:
 *  - `getExercises` returns cached sets instantly, so opening Exercises never
 *    shows a spinner for a type already generated.
 *  - Concurrent callers for the same type share ONE request via `inFlight`,
 *    so a tab switch plus a prefetch cannot queue duplicate generations.
 *  - `prefetch` warms the other types in the background, so switching types is
 *    usually instant too.
 */
const cache = new Map<ExerciseType, Exercise[]>();
const sources = new Map<ExerciseType, "generated" | "seed">();
const inFlight = new Map<ExerciseType, Promise<Exercise[]>>();

export function peek(type: ExerciseType): Exercise[] | undefined {
  return cache.get(type);
}

export function sourceOf(type: ExerciseType): "generated" | "seed" | null {
  return sources.get(type) ?? null;
}

export function isWarmed(type: ExerciseType): boolean {
  return cache.has(type);
}

export function allWarmed(): boolean {
  return (["en2pl", "pl2en", "cloze"] as ExerciseType[]).every((t) => cache.has(t));
}

/** Fetches, or returns the cached set. Never issues a second concurrent request. */
export function getExercises(
  type: ExerciseType,
  count = 5,
  weakWords: string[] = [],
  force = false,
): Promise<Exercise[]> {
  if (!force && cache.has(type)) return Promise.resolve(cache.get(type)!);

  const pending = inFlight.get(type);
  if (pending) return pending;

  const request = (async () => {
    try {
      const set = await fetchExercises(type, count, weakWords);
      cache.set(type, set.exercises);
      sources.set(type, set.source);
      return set.exercises;
    } finally {
      inFlight.delete(type);
    }
  })();

  inFlight.set(type, request);
  return request;
}

/** Replaces one exercise in place, e.g. after grading, without a round trip. */
export function replaceAt(type: ExerciseType, index: number, next: Exercise): void {
  const current = cache.get(type);
  if (!current || index < 0 || index >= current.length) return;
  current[index] = next;
  cache.set(type, [...current]);
}

export function setAt(type: ExerciseType, index: number): Exercise | undefined {
  return cache.get(type)?.[index];
}

/**
 * Warms every type that is not already cached, one at a time.
 *
 * Sequential on purpose: gemma3:4b is CPU-bound here, so firing three
 * generations at once would make all three slower and would delay whatever the
 * user is actually waiting for.
 */
export async function prefetch(
  types: ExerciseType[],
  count = 5,
  weakWords: string[] = [],
): Promise<void> {
  for (const type of types) {
    if (cache.has(type) || inFlight.has(type)) continue;
    try {
      await getExercises(type, count, weakWords);
    } catch {
      // A failed warm-up is not worth surfacing; the real request will retry.
    }
  }
}