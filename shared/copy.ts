/**
 * Static fallback copy.
 *
 * Lives here rather than in `server/prompt.ts` because the browser needs it
 * immediately: the panel renders this on first paint, then swaps in a generated
 * scenario once the model replies. Importing from `server/` would pull server
 * code into the client bundle.
 */
export const GREETING =
  "Cześć! Wciśnij Nowa sytuacja, a wybiorę dla ciebie scenę do przećwiczenia. Możesz też w każdej chwili zapytać co to znaczy, a przetłumaczę ci zdanie na angielski.";

export const FALLBACK_INTRO =
  "Hej! Jestem twoim polskim rozmówcą. Napisz do mnie po polsku, a poprawię cię po cichu.";

export const SCENARIO_FAILED =
  "Nie udało się wczytać sytuacji. Spróbujmy jeszcze raz.";

export const STARTER_PROMPTS = [
  "Cześć, jak się masz?",
  "Poproszę kawę.",
  "Co to znaczy?",
];
