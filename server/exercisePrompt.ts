/**
 * Exercise generation.
 *
 * Two things matter here, and both come from watching gemma3:4b fail:
 *
 * 1. A single shared system prompt produced mediocre exercises. The model
 *    drifted between formats, ignored "fill the gap" blanks, and padded the
 *    output with prose. Each type now gets its own prompt, in English (the
 *    model follows English instructions more reliably than Polish ones) with a
 *    concrete example JSON object to imitate.
 *
 * 2. Output length is capped per type. A shared generous budget made the model
 *    ramble to the cap; one request took 188s. Cloze needs few tokens, en2pl
 *    needs the most.
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

/** Shorthand used in the per-type prompts below. */
const RULES = `You are a Polish language teacher creating exercises for an A2 learner (beginner to lower-intermediate).

Hard requirements:
- Reply with ONLY a JSON array. No markdown, no code fences, no commentary before or after.
- Every object has exactly the keys: "type", "prompt", "answer", "explanation".
- "explanation" is ONE short sentence in simple Polish. It is reading practice for the learner.
- Sentences are 4-9 words, about everyday life: food, shopping, city, work, family, weather, travel.
- Use correct Polish grammar and case endings. Double-check endings before answering.
- Adjectives must agree with their noun in gender and number: "nowy dom" but "nowa książka", "nowe auto".
- "explanation" must be about the word in "answer", never about a different word.
- Never use double quotes or apostrophes inside a text value.
- No duplicates. Every exercise must be different.`;

type Spec = {
  system: string;
  numPredict: number;
};

const SPECS: Record<ExerciseType, Spec> = {
  en2pl: {
    numPredict: 520,
    system: `${RULES}

TASK: translate English into Polish.

- "prompt" is an English sentence.
- "answer" is its correct Polish translation, with natural Polish word order and correct case endings.

EXAMPLE OUTPUT:
[
  {
    "type": "en2pl",
    "prompt": "I would like a coffee, please.",
    "answer": "Poproszę kawę.",
    "explanation": "Poproszę — grzeczna prośba, bardzo częsta w kawiarni."
  },
  {
    "type": "en2pl",
    "prompt": "I have two brothers.",
    "answer": "Mam dwóch braci.",
    "explanation": "Dwu — dwóch, dwie, dwóch, zależnie od rzeczownika."
  }
]`,
  },

  pl2en: {
    numPredict: 520,
    system: `${RULES}

TASK: translate Polish into English.

- "prompt" is a simple Polish sentence.
- "answer" is its correct English translation, in natural everyday English.

EXAMPLE OUTPUT:
[
  {
    "type": "pl2en",
    "prompt": "Cześć, jak się masz?",
    "answer": "Hi, how are you?",
    "explanation": "Jak się masz — bardzo potocznie."
  },
  {
    "type": "pl2en",
    "prompt": "Mieszkam w Warszawie.",
    "answer": "I live in Warsaw.",
    "explanation": "W Warszawie — miasto po polsku zawsze z przyimkiem w."
  }
]`,
  },

  cloze: {
    numPredict: 420,
    system: `${RULES}

TASK: choose ONE word that can be removed from a Polish sentence.

- "prompt" is a COMPLETE, natural Polish sentence. It must be readable as it stands.
- Write NO underscores and NO gaps in "prompt". The application removes the word for you.
- "answer" is that ONE word, copied exactly as it appears in "prompt", with no punctuation.
- Choose a content word, never a function word like w, z, na, do, i, się, jest.
- Never choose the first or the last word of the sentence.
- "explanation" must be about the word in "answer", in one short Polish sentence.

EXAMPLE OUTPUT:
[
  {
    "type": "cloze",
    "prompt": "Cześć, jak się masz?",
    "answer": "jak",
    "explanation": "Jak się masz — jak się ktoś ma, potocznie."
  },
  {
    "type": "cloze",
    "prompt": "Jutro idę do kawiarni.",
    "answer": "kawiarni",
    "explanation": "Do kawiarni — przyimek do wymaga dopełniacza."
  }
]`,
  },
};

export function systemPromptFor(type: ExerciseType): string {
  return SPECS[type].system;
}

export function numPredictFor(type: ExerciseType): number {
  return SPECS[type].numPredict;
}

export function buildExercisePrompt(
  type: ExerciseType,
  count: number,
  weakWords: string[],
): string {
  const parts: string[] = [
    `Create exactly ${count} exercises of type "${type}".`,
    `Output a JSON array of ${count} objects, following the example format exactly.`,
  ];

  if (weakWords.length > 0) {
    parts.push(
      `The learner often gets these wrong. Prefer exercises using this vocabulary where it fits naturally: ${weakWords
        .slice(0, 6)
        .join(" / ")}.`,
    );
  }

  parts.push("Reply with only the JSON array.");
  return parts.join("\n");
}