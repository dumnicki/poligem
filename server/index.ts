import express from "express";
import cors from "cors";
import { SYSTEM_PROMPT } from "./prompt.js";
import {
  buildExercisePrompt,
  systemPromptFor,
  numPredictFor,
  EXERCISE_TYPES,
  type Exercise,
  type ExerciseType,
} from "./exercisePrompt.js";
import { SEED_EXERCISES } from "./seedExercises.js";

// Optional .env; every value already has a working default.
try {
  process.loadEnvFile();
} catch {
  // no .env file — use defaults / real environment
}

const PORT = Number(process.env.PORT ?? 3001);
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

type IncomingMessage = { role: "user" | "assistant"; content: string };

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/** Reports whether Ollama is up and whether the configured model is pulled. */
app.get("/api/health", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!r.ok) throw new Error(`Ollama responded ${r.status}`);
    const data = (await r.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    res.json({ ok: true, model: MODEL, modelPresent: models.includes(MODEL), models });
  } catch (err) {
    res.status(503).json({
      ok: false,
      model: MODEL,
      error: "Ollama unreachable. Is `ollama serve` running?",
      detail: String(err),
    });
  }
});

/**
 * Streams a tutor reply. Ollama emits newline-delimited JSON; we pipe the raw
 * bytes through untouched rather than re-encoding, so Polish diacritics survive.
 */
app.post("/api/chat", async (req, res) => {
  const history: IncomingMessage[] = Array.isArray(req.body?.messages)
    ? req.body.messages
    : [];

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
        stream: true,
        options: { temperature: 0.7, num_predict: 300 },
      }),
    });

    if (!ollamaRes.ok || !ollamaRes.body) {
      const body = await ollamaRes.text().catch(() => "");
      throw new Error(`Ollama responded ${ollamaRes.status} ${body}`);
    }

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    for await (const chunk of ollamaRes.body) {
      res.write(Buffer.from(chunk));
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: String(err) });
    } else {
      // stream already started — the client will see a truncated reply
      res.end();
    }
  }
});

/**
 * Pulls a JSON array out of whatever the model actually returned.
 *
 * gemma3:4b follows the prompt most of the time. When it doesn't, it wraps the
 * array in ```json fences, prefixes it with a sentence of preamble, or emits
 * prose after the closing bracket. All three are recoverable, so they are
 * handled rather than treated as errors.
 */
/** Polish function words that are too structural to be a useful cloze answer. */
const STOPWORDS = new Set([
  "w", "z", "na", "do", "i", "a", "o", "u", "w", "nie", "to", "że", "się",
  "jest", "są", "być", "tak", "jak", "ale", "po", "za", "od", "przez", "dla",
]);

function pickBlankIndex(sentence: string): number {
  const words = sentence.trim().split(/\s+/);
  // Prefer a content word in the middle of the sentence, so the remaining text
  // still gives the learner enough context to infer the missing word.
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
 * trusting the prompt: pick the sentence word matching `answer`, and if the
 * answer isn't a word in the sentence, fall back to a content word.
 */
function applyCloze(ex: Exercise): Exercise | null {
  let target = ex.answer.trim().split(/\s+/)[0] ?? "";
  target = target.replace(/[.!?…]+$/, "");
  if (!target) return null;

  // The prompt asks for a complete sentence, but gemma3:4b sometimes inserts
  // blanks anyway. Strip them first, otherwise blanking a word yields two gaps
  // and the learner cannot tell which one to fill.
  const cleaned = ex.prompt.replace(/_{2,}/g, " ").replace(/\s{2,}/g, " ").trim();
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

function parseExercises(raw: string, type: ExerciseType): Exercise[] {
  let text = raw.trim();

  // Strip ```json ... ``` fences, with or without the language tag.
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
    // here would grade a Polish→English answer against an English→Polish key.
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

/**
 * Only one exercise generation may be in flight at a time.
 *
 * gemma3:4b on this machine produces roughly one token every 120ms on CPU. Two
 * concurrent requests do not run in parallel, they interleave and both get
 * slower — a second request would also delay a chat reply. Queueing here is
 * simpler and more predictable than trying to manage it in the browser.
 */
let exerciseQueue: Promise<unknown> = Promise.resolve();

app.post("/api/exercise", async (req, res) => {
  const type = req.body?.type as ExerciseType;
  const count = Math.min(Math.max(Number(req.body?.count ?? 5) || 5, 1), 10);
  const weakWords: string[] = Array.isArray(req.body?.weakWords)
    ? req.body.weakWords.filter((w: unknown): w is string => typeof w === "string")
    : [];

  if (!EXERCISE_TYPES.includes(type)) {
    res.status(400).json({ error: `Unknown exercise type: ${String(type)}` });
    return;
  }

  const run = exerciseQueue.then(() => generateExercises(type, count, weakWords));
  // Keep the chain alive regardless of outcome, or one failure blocks all future
  // generations behind a rejected promise.
  exerciseQueue = run.catch(() => undefined);

  const result = await run;
  res.json(result);
});

async function generateExercises(
  type: ExerciseType,
  count: number,
  weakWords: string[],
): Promise<{
  source: "generated" | "seed";
  type: ExerciseType;
  exercises: Exercise[];
  error?: string;
}> {
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
    let exercises = parseExercises(data.response ?? "", type);

    // Generation failed or came back unusable — serve the curated pool instead
    // of an error screen, so the UI is always demonstrable.
    if (exercises.length === 0) {
      exercises = [...SEED_EXERCISES[type]].slice(0, count);
    }

    return { source: exercises.length > 0 ? "generated" : "seed", type, exercises };
  } catch (err) {
    return {
      source: "seed",
      type,
      exercises: [...SEED_EXERCISES[type]].slice(0, count),
      error: String(err),
    };
  }
}

app.listen(PORT, () => {
  console.log(`poligem server  http://localhost:${PORT}`);
  console.log(`  ollama  ${OLLAMA_URL}`);
  console.log(`  model   ${MODEL}`);
});