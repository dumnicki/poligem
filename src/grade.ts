/**
 * Answer grading.
 *
 * Polish diacritics are significant: "kawa" and "kawę" are different words, so
 * normalisation must never strip them. We only fold case, surrounding
 * punctuation and repeated whitespace.
 */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-level overlap, used to accept a translation that is nearly right. */
function overlap(expected: string, given: string): number {
  const a = normalize(expected).split(" ").filter(Boolean);
  const b = normalize(given).split(" ").filter(Boolean);
  if (a.length === 0 || b.length === 0) return 0;

  const pool = [...b];
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