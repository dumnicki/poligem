import type { Attempt } from "../src/types";

/**
 * Learner level, derived from measured accuracy rather than hardcoded.
 *
 * Kept in a shared module because both the browser (which derives it from local
 * history) and the server (which writes it into prompts) need the same rules.
 */
export type Level = "A1" | "A2" | "B1";

export const LEVELS: Level[] = ["A1", "A2", "B1"];

export const LEVEL_NAMES: Record<Level, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
};

/**
 * Below this many answers we have no real signal, so we hold the default rather
 * than let two lucky guesses demote someone to A1.
 */
const MIN_SAMPLES = 6;

/**
 * Derives a level from answer history.
 *
 * Deliberately conservative and hysteretic: dropping to A1 on 50% from a small
 * sample would be alarming and wrong, so the A1 threshold is only crossed below
 * it, and only with enough data to justify it.
 */
export function deriveLevel(attempts: Attempt[]): Level {
  if (attempts.length < MIN_SAMPLES) return "A2";

  const correct = attempts.filter((a) => a.correct).length;
  const accuracy = correct / attempts.length;

  if (accuracy < 0.55) return "A1";
  if (accuracy < 0.8) return "A2";
  // Only promote once there is enough evidence, not on a lucky streak of five.
  if (accuracy >= 0.8 && attempts.length >= 12) return "B1";
  return "A2";
}

export function isLevel(value: unknown): value is Level {
  return typeof value === "string" && (LEVELS as string[]).includes(value);
}

/**
 * What each level means to the model. Prompt wording, not display copy.
 */
export const LEVEL_PROMPT: Record<Level, string> = {
  A1: `POZIOM A1 — uczeń początkujący.
- Zdania maksymalnie 4-6 słów.
- Tylko najczęstsze, codzienne słowa. Żadnego czasu przeszłego, żadnych przyimków w trudnych formach.
- Po każdym nowym słowie podaj znaczenie: slowo (znaczenie).`,

  A2: `POZIOM A2 — uczeń elementarny.
- Zdania 4-9 słów.
- Codzienne słownictwo. Możesz używać prostych przyimków i czasu przeszłego.
- Nowe słowa wyjaśniaj krótko, gdy uczeń się o nie zapyta.`,

  B1: `POZIOM B1 — uczeń średniozaawansowany.
- Zdania do 12 słów, swobodniejsze słownictwo.
- Możesz używać idiomów i potoczyska, ale zawsze z możliwością pytania o znaczenie.
- Nie prostuj wszystkiego — poprawiaj tylko to, co naprawdę przeszkadza.`,
};