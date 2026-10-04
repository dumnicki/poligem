import { POOL_TARGET } from "./config.js";
import { enqueue, generate } from "./generation.js";
import { EXERCISE_TYPES, type Exercise, type ExerciseType } from "./exercisePrompt.js";
import { SEED_EXERCISES } from "./seedExercises.js";

/**
 * Server-side exercise pool.
 *
 * The learner should never wait for a model. The server keeps POOL_TARGET ready
 * exercises of each type at all times and tops them up in the background, so a
 * request is served from memory in single-digit milliseconds.
 *
 * Startup fills the pools with the curated seed exercises *instantly*, then
 * replaces them with generated ones as those arrive. That ordering is what
 * makes the guarantee hold from the first request: even in the first second
 * after boot, and even with Ollama switched off, every type can be served.
 */

type PoolState = {
  /** Generated exercises only. Seeds are never mixed in, so taking from the
   * pool always prefers real generated material when any exists. */
  items: Exercise[];
  /** Generations currently in flight for this type, so we don't over-ask. */
  pending: number;
  /** Counts, for /api/exercises/status. */
  generated: number;
  seeds: number;
  lastError?: string;
};

const pools = new Map<ExerciseType, PoolState>();

function state(type: ExerciseType): PoolState {
  let s = pools.get(type);
  if (!s) {
    s = { items: [], pending: 0, generated: 0, seeds: 0 };
    pools.set(type, s);
  }
  return s;
}

/**
 * Weak spots, keyed by the prompt that was missed.
 *
 * These are fed back into generation ("the learner often gets these wrong"),
 * which is what makes replenishment adaptive rather than just repeating the
 * same difficulty. Counted server-side so it survives a page reload and so the
 * pool has it without the browser volunteering.
 */
const weaknesses = new Map<string, { misses: number; correct: number }>();

export function reportAnswer(prompt: string, correct: boolean): void {
  const key = prompt.trim();
  if (!key) return;
  const entry = weaknesses.get(key) ?? { misses: 0, correct: 0 };
  if (correct) entry.correct++;
  else entry.misses++;
  weaknesses.set(key, entry);
}

function weakHints(): string[] {
  return [...weaknesses.entries()]
    .filter(([, v]) => v.misses > v.correct)
    .sort((a, b) => b[1].misses - a[1].misses)
    .slice(0, 6)
    .map(([prompt]) => prompt);
}

export function weaknessSnapshot(): { prompt: string; misses: number; correct: number }[] {
  return [...weaknesses.entries()]
    .map(([prompt, v]) => ({ prompt, ...v }))
    .sort((a, b) => b.misses - a.misses);
}

/** Schedules a top-up if this type is below target. Never blocks the caller. */
function ensure(type: ExerciseType): void {
  const s = state(type);
  const need = POOL_TARGET - (s.items.length + s.pending);
  if (need <= 0) return;

  s.pending += need;

  void enqueue(async () => {
    try {
      const { exercises } = await generate(type, need, weakHints());
      if (exercises.length > 0) {
        const s2 = state(type);
        // Guard against the model repeating itself or echoing something already queued.
        const seen = new Set(s2.items.map((e) => e.prompt.toLowerCase()));
        let added = 0;
        for (const ex of exercises) {
          const key = ex.prompt.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          s2.items.push(ex);
          added++;
        }
        s2.generated += added;
      }
    } catch (err) {
      state(type).lastError = String(err);
    } finally {
      // Must happen on every path or the pool stalls forever after one failure.
      state(type).pending -= need;
    }
  });
}

/** Rotating index per type so an exhausted pool never repeats one exercise. */
const seedCursor = new Map<ExerciseType, number>();

/**
 * Takes one exercise. Generated material is always preferred; the curated set is
 * only used while the pool is still empty (during warm-up, or if Ollama is
 * down), and rotates so the same sentence is never shown twice in a row.
 */
export function take(type: ExerciseType): { exercise: Exercise; source: "generated" | "seed" } {
  const s = state(type);

  if (s.items.length > 0) {
    const exercise = s.items.shift()!;
    s.generated = Math.max(0, s.generated - 1);
    ensure(type); // refill in the background while the learner reads this one
    return { exercise, source: "generated" };
  }

  const seeds = SEED_EXERCISES[type];
  const cursor = (seedCursor.get(type) ?? 0) % seeds.length;
  seedCursor.set(type, cursor + 1);
  s.seeds++;
  ensure(type);
  return { exercise: seeds[cursor], source: "seed" };
}

export function peekDepth(type: ExerciseType): number {
  return state(type).items.length;
}

export function status() {
  return {
    target: POOL_TARGET,
    types: Object.fromEntries(
      EXERCISE_TYPES.map((t) => {
        const s = state(t);
        return [
          t,
          { ready: s.items.length, pending: s.pending, generated: s.generated, seeds: s.seeds },
        ];
      }),
    ),
    weaknesses: weaknessSnapshot().length,
  };
}

/**
 * Queues generation for every type at boot.
 *
 * Deliberately does not prefill the pool with seeds: `take` already falls back
 * to the curated set while the pool is empty, and it rotates, so warm-up is
 * covered without seeds ever competing with generated material for a slot.
 */
export function warmAll(): void {
  for (const type of EXERCISE_TYPES) {
    ensure(type);
  }
}