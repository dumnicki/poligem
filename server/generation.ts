import { OLLAMA_URL, MODEL } from "./config.js";
import {
  buildExercisePrompt,
  numPredictFor,
  systemPromptFor,
  type Exercise,
  type ExerciseType,
} from "./exercisePrompt.js";

/**
 * Serialises every call into Ollama.
 *
 * gemma3:4b on this machine produces roughly one token per 120ms on CPU. Two
 * concurrent requests do not run in parallel — they interleave and both get
 * slower, and a background pool refill would also stall a live chat reply.
 * One global queue keeps that predictable.
 */
let chain: Promise<unknown> = Promise.resolve();

export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn);
  // Keep the chain alive after a rejection, or one failure blocks all later work.
  chain = run.catch(() => undefined);
  return run;
}

/** Polish function words that are too structural to be a useful cloze answer. */
const STOPWORDS = new Set([
  "w", "z", "na", "do", "i", "a", "o", "u", "nie", "to", "że", "się",
  "jest", "są", "być", "tak", "jak", "ale", "po", "za", "od", "przez", "dla",
]);

function pickBlankIndex(sentence: string): number {
  const words = sentence.trim().split(/\s+/);
  // Prefer a content word in the middle, so the remaining text still gives the
  // learner enough context to infer the missing word.
  const candidates: number[] = [];
  words.forEach((raw, i) => {
    const clean = raw.replace(/[^\p{L}]/gu, "").toLowerCase();
    if (clean.length < 3) return;
    if (STOPWORDS.has(clean)) return;
    if (i === 0) return; // never blank the first word; no context survives
    candidates.push(i);
  });
  if (candidates.length === 0) return -1;
  return candidates[Math.floor(candidates.length / 2)];
}

/**
 * The model reliably returns a complete Polish sentence and a one-word answer,
 * but does not reliably blank it out. So we blank it ourselves rather than
 * trusting the prompt.
 */
function applyCloze(ex: Exercise): Exercise | null {
  let target = ex.answer.trim().split(/\s+/)[0] ?? "";
  target = target.replace(/[.!?…]+$/, "");
  if (!target) return null;

  // The prompt asks for a complete sentence, but gemma3:4b sometimes inserts
  // blanks anyway. Strip them first, otherwise blanking a word yields two gaps
  // and the learner cannot tell which one to fill.
  const cleaned = ex.prompt.replace(/_{2,}/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return null;
  const words = cleaned.split(/\s+/);

  let idx = words.findIndex((w) => {
    const clean = w.replace(/[^\p{L}]/gu, "").toLowerCase();
    return clean === target.toLowerCase();
  });

  if (idx === -1) {
    idx = pickBlankIndex(cleaned);
    if (idx === -1) return null;
    target = words[idx].replace(/[^\p{L}\p{N}]/gu, "");
  }

  if (!target) return null;

  const blanked = [...words];
  blanked[idx] = "___";
  return { ...ex, prompt: blanked.join(" "), answer: target };
}

/**
 * Pulls a JSON array out of whatever the model actually returned.
 *
 * gemma3:4b follows the prompt most of the time. When it doesn't, it wraps the
 * array in ```json fences, prefixes it with a sentence of preamble, or emits
 * prose after the closing bracket. All three are recoverable.
 */
export function parseExercises(raw: string, type: ExerciseType): Exercise[] {
  let text = raw.trim();

  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  // Fall back to the outermost array if there is surrounding prose.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Exercise[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const prompt = typeof r.prompt === "string" ? r.prompt.trim() : "";
    const answer = typeof r.answer === "string" ? r.answer.trim() : "";
    if (!prompt || !answer) continue;

    // Trust the requested type over the model's self-reported one: a mismatch
    // would grade a Polish→English answer against an English→Polish key.
    const exercise: Exercise = {
      type,
      prompt,
      answer,
      explanation: typeof r.explanation === "string" ? r.explanation.trim() : undefined,
    };
    out.push(exercise);
  }

  if (type === "cloze") {
    return out.map(applyCloze).filter((e): e is Exercise => e !== null);
  }
  return out;
}

export async function generate(
  type: ExerciseType,
  count: number,
  weakWords: string[],
): Promise<{ source: "generated" | "empty"; exercises: Exercise[]; error?: string }> {
  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        model: MODEL,
        system: systemPromptFor(type),
        prompt: buildExercisePrompt(type, count, weakWords),
        stream: false,
        options: { temperature: 0.8, num_predict: numPredictFor(type) },
      }),
    });

    if (!ollamaRes.ok) throw new Error(`Ollama responded ${ollamaRes.status}`);
    const data = (await ollamaRes.json()) as { response?: string };
    const exercises = parseExercises(data.response ?? "", type);

    return { source: exercises.length ? "generated" : "empty", exercises };
  } catch (err) {
    return { source: "empty", exercises: [], error: String(err) };
  }
}