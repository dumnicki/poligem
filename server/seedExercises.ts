import type { Exercise, ExerciseType } from "./exercisePrompt.js";

/**
 * Hand-written fallback pool.
 *
 * gemma3:4b sometimes returns malformed JSON. A demo that shows an error screen
 * is worth less than one that shows a slightly boring exercise, so the endpoint
 * falls back to these when generation fails. They are also the exercises used to
 * verify the drill UI without waiting on the model.
 */
export const SEED_EXERCISES: Record<ExerciseType, Exercise[]> = {
  en2pl: [
    {
      type: "en2pl",
      prompt: "I would like a coffee, please.",
      answer: "Poproszę kawę.",
      explanation: "Poproszę — grzeczna prośba, najczęstsza w kawiarni.",
    },
    {
      type: "en2pl",
      prompt: "Where is the train station?",
      answer: "Gdzie jest dworzec kolejowy?",
      explanation: "Dworzec kolejowy — stacja kolejowa po polsku.",
    },
    {
      type: "en2pl",
      prompt: "I have two brothers.",
      answer: "Mam dwóch braci.",
      explanation: "Dwu… formy: dwóch, dwie, dwóch — zależy od rzeczownika.",
    },
    {
      type: "en2pl",
      prompt: "The weather is nice today.",
      answer: "Dzisiaj jest ładna pogoda.",
      explanation: "Dzisiaj — dziś jest bardziej potoczne.",
    },
    {
      type: "en2pl",
      prompt: "I work from home on Fridays.",
      answer: "W piątki pracuję w domu.",
      explanation: "W + locativum: w piątki znaczy w dniu tygodnia.",
    },
  ],
  pl2en: [
    {
      type: "pl2en",
      prompt: "Cześć, jak się masz?",
      answer: "Hi, how are you?",
      explanation: "Jak się masz — bardzo potocznie; po polsku: jak się Pan/Pani ma.",
    },
    {
      type: "pl2en",
      prompt: "Nie rozumiem, możesz powtórzyć?",
      answer: "I don't understand, can you repeat?",
      explanation: "Możesz powtórzyć — uprzejma prośba, bardzo częsta.",
    },
    {
      type: "pl2en",
      prompt: "Idę jutro do kawiarni.",
      answer: "I'm going to the café tomorrow.",
      explanation: "Jutro — czas przyszły.",
    },
    {
      type: "pl2en",
      prompt: "Mieszkam w Warszawie.",
      answer: "I live in Warsaw.",
      explanation: "W Warszawie — miasto po polsku zawsze z 'w'.",
    },
    {
      type: "pl2en",
      prompt: "To mi się podoba.",
      answer: "I like that.",
      explanation: "Podobać się — lubić coś; zawsze z 'się'.",
    },
  ],
  cloze: [
    {
      type: "cloze",
      prompt: "Cześć, ___ się masz?",
      answer: "jak",
      explanation: "Jak się masz — jak się ktoś ma, potocznie.",
    },
    {
      type: "cloze",
      prompt: "___ jutro do kawiarni.",
      answer: "Idę",
      explanation: "Idę — ja idę. To czasownik 'iść' w 1. osobie.",
    },
    {
      type: "cloze",
      prompt: "Poproszę kawę z ___.",
      answer: "mlekiem",
      explanation: "Z mlekiem — 'z' + narzędnik (mleko → z mlekiem).",
    },
    {
      type: "cloze",
      prompt: "___ mieszka w Krakowie.",
      answer: "Ona",
      explanation: "Ona mieszka — 'on'/'ona' + czasownik.",
    },
    {
      type: "cloze",
      prompt: "Nie ___ polski.",
      answer: "rozumiem",
      explanation: "Rozumieć — 'nie' przed czasownikiem odmienia jak przymiotnik.",
    },
  ],
};