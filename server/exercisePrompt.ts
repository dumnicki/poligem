/**
 * Structured exercise generation.
 *
 * gemma3:4b is a small model, so the prompt is deliberately rigid: one JSON
 * array, no prose, no code fences, no quotes inside string values. The parser in
 * `server/index.ts` still defends against all of that, because a 4B model will
 * eventually do it anyway.
 *
 * Explanations are written in short, simple Polish on purpose — each one doubles
 * as reading practice for the learner.
 */
export type ExerciseType = "en2pl" | "pl2en" | "cloze";

export type Exercise = {
  type: ExerciseType;
  prompt: string;
  answer: string;
  explanation?: string;
};

export const EXERCISE_TYPES: ExerciseType[] = ["en2pl", "pl2en", "cloze"];

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  en2pl: "English → Polish",
  pl2en: "Polish → English",
  cloze: "Fill the gap",
};

export const EXERCISE_SYSTEM_PROMPT = `Jesteś nauczycielem języka polskiego. Tworzysz krótkie ćwiczenia dla osoby na poziomie A2.

Odpowiedz WYŁĄCZNIE poprawnym JSON. Bez markdown. Bez potróbek json. Bez komentarzy. Bez tekstu przed tablicą i po niej.

Format: tablica JSON obiektów. Każdy obiekt ma te klucze:
"type" - jedno z: en2pl, pl2en, cloze, order
"prompt" - tekst do pokazania uczniowi
"answer" - poprawna odpowiedź
"explanation" - jedno krótkie zdanie po polsku

Ważne: odpowiedź ma być KROTKA. Maksymalnie 5 ćwiczeń. Nie dodawaj przykładów, nie tłumacz reguł, nie pisz nic poza tablicą JSON.

Reguły dla każdego typu:

en2pl: "prompt" to zdanie po angielsku, "answer" to jego poprawne tłumaczenie po polsku.
pl2en: "prompt" to zdanie po polsku, "answer" to jego poprawne tłumaczenie po angielsku.
cloze: "prompt" to pełne zdanie po polsku, BEZ żadnych podkreśleń. "answer" to jedno słowo z tego zdania, które można bezpiecznie usunąć (nie rzeczownik w pierwszej pozycji).

Zasady:
- Zdania krótkie, 4-9 słów. Codzienne tematy: jedzenie, zakupy, miasto, praca, rodzina, pogoda, podróże.
- "answer" ma być dokładnie taki, jak uczeń ma go wpisać. Bez dodatkowych wyjaśnień.
- Nie używaj cudzysłowów ani apostrofów wewnątrz wartości tekstowych.
- Nie powtarzaj się: każde ćwiczenie inne.
- Wyjaśnienie po polsku, max jedno zdanie, prostym językiem.`;

export function buildExercisePrompt(
  type: ExerciseType,
  count: number,
  weakWords: string[],
): string {
  const parts: string[] = [];

  parts.push(`Typ ćwiczeń: ${type}.`);
  parts.push(`Liczba ćwiczeń: ${count}.`);

  if (weakWords.length > 0) {
    parts.push(
      `Ucznięń często myli te słowa, więc użyj ich tam, gdzie pasują: ${weakWords
        .slice(0, 8)
        .join(", ")}.`,
    );
  }

  parts.push("Poziom A2. Zdania krótkie i codzienne.");
  parts.push("Odpowiedz tylko tablicą JSON.");

  return parts.join("\n");
}