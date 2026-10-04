/**
 * Answer grading.
 *
 * Polish diacritics are significant: "kawa" and "kawę" are different words, so
 * normalisation must never strip them. We only fold case, surrounding
 * punctuation and repeated whitespace.
 *
 * NFC normalisation is load-bearing here: "ó" can arrive as one codepoint
 * (U+00F3) or as "o" plus a combining accent (U+006F U+0301). They render
 * identically but compare unequal, so without NFC a correct answer is graded
 * wrong whenever the model's encoding differs from the seed data.
 */
function normalize(s: string): string {
  return s
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fraction of the expected content words that appear in the answer.
 *
 * Stopwords are ignored so that a dropped "the" or "w" doesn't count against the
 * learner, but only when the expected side actually contains stopwords — Polish
 * function words carry grammatical meaning (w vs z vs na), so stripping them
 * unconditionally would let a real case error pass.
 */
const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "i", "you", "we", "it", "is", "am", "are",
  "w", "z", "na", "do", "i", "a", "o", "u", "nie", "to", "że", "się", "jest",
]);

function overlap(expected: string, given: string): number {
  const expectedWords = normalize(expected).split(" ").filter(Boolean);
  const givenWords = normalize(given).split(" ").filter(Boolean);
  if (expectedWords.length === 0 || givenWords.length === 0) return 0;

  // Drop stopwords only from the side that contains them. Polish prepositions
  // are grammatical (w vs z vs na), so they only become ignorable when the
  // answer is clearly the English side of a translation.
  const isEnglishSide = expectedWords.some((w) => !/[\u0100-\u017F]/.test(w));
  const a = isEnglishSide
    ? expectedWords.filter((w) => !STOPWORDS.has(w))
    : expectedWords;
  if (a.length === 0) return 0;

  const pool = [...givenWords];
  let matched = 0;
  for (const word of a) {
    const i = pool.indexOf(word);
    if (i !== -1) {
      pool.splice(i, 1);
      matched++;
    }
  }
  return matched / a.length;
}

export type Verdict = "correct" | "close" | "wrong";

export function grade(expected: string, given: string): Verdict {
  const e = normalize(expected);
  const g = normalize(given);
  if (!g) return "wrong";
  if (e === g) return "correct";
  // "close" needs a real overlap, and a single-word answer must match exactly.
  if (e.includes(" ") && overlap(expected, given) >= 0.8) return "close";
  return "wrong";
}