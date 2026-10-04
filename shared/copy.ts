/**
 * Static fallback copy.
 *
 * Lives here rather than in `server/prompt.ts` because the browser needs it
 * immediately: the panel renders this on first paint, then swaps in a generated
 * scenario once the model replies. Importing from `server/` would pull server
 * code into the client bundle.
 */
export const GREETING =
  "Cześć! Jestem twoim polskim rozmówcą. Pisz do mnie po polsku — poprawię cię po cichu, kiedy trzeba. Przygotowuję dla ciebie sytuację do przećwiczenia.";

export const FALLBACK_INTRO =
  "Hej! Jestem twoim polskim rozmówcą. Napisz do mnie po polsku, a poprawię cię po cichu.";

export const SCENARIO_FAILED =
  "Nie udało się wczytać sytuacji. Spróbujmy jeszcze raz.";

export const STARTER_PROMPTS = [
  "Cześć, jak się masz?",
  "Poproszę kawę.",
  "Co to znaczy?",
];
