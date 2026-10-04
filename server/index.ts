import express from "express";
import cors from "cors";
import { OLLAMA_URL, MODEL, PORT } from "./config.js";
import { DEFAULT_LEVEL, GREETING, TRANSLATE_SYSTEM, tutorPrompt } from "./prompt.js";
import { isLevel } from "../shared/levels.js";
import { EXERCISE_TYPES, type ExerciseType } from "./exercisePrompt.js";
import { peekDepth, reportAnswer, status, take, warmAll } from "./pool.js";
import { enqueue, generate } from "./generation.js";

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
  const level = isLevel(req.body?.level) ? req.body.level : DEFAULT_LEVEL;

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: tutorPrompt(level) }, ...history],
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
 * Hands out the next exercise of a type, from memory.
 *
 * Returns immediately — the pool was filled at boot and refills in the
 * background, so this is a map lookup plus a queue push, never a model call.
 */
app.get("/api/exercise/next", (req, res) => {
  const type = String(req.query.type ?? "") as ExerciseType;
  if (!EXERCISE_TYPES.includes(type)) {
    res.status(400).json({ error: `Unknown exercise type: ${String(req.query.type)}` });
    return;
  }

  const { exercise, source } = take(type);
  res.json({
    exercise,
    source,
    depth: peekDepth(type),
  });
});

/**
 * Records how the learner did, so replenishment can target weak spots.
 * Fire-and-forget from the browser: no response body is needed.
 */
app.post("/api/exercise/report", (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  const correct = req.body?.correct === true;
  reportAnswer(prompt, correct);
  res.json({ ok: true });
});

/** Pool depths, pending generations, and known weak spots. */
app.get("/api/exercises/status", (_req, res) => {
  res.json(status());
});

/**
 * Forces a generation instead of serving from the pool. Used by the warm-up and
 * kept for debugging a single type from the terminal.
 */
app.post("/api/exercise/generate", async (req, res) => {
  const type = String(req.body?.type ?? "") as ExerciseType;
  if (!EXERCISE_TYPES.includes(type)) {
    res.status(400).json({ error: `Unknown exercise type: ${String(req.body?.type)}` });
    return;
  }
  const count = Math.min(Math.max(Number(req.body?.count ?? 3) || 3, 1), 8);
  res.json(await enqueue(() => generate(type, count, [])));
});

/**
 * Translates one Polish utterance into English for the Translate button.
 *
 * Separate from /api/chat on purpose: a single-purpose prompt with no persona is
 * much more reliable at returning a bare translation than asking the role-playing
 * tutor to break character on demand.
 */
app.post("/api/chat/translate", async (req, res) => {
  const polish = typeof req.body?.polish === "string" ? req.body.polish.trim() : "";
  if (!polish) {
    res.status(400).json({ error: "polish is required" });
    return;
  }

  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        model: MODEL,
        system: TRANSLATE_SYSTEM,
        prompt: polish,
        stream: false,
        options: { temperature: 0.2, num_predict: 120 },
      }),
    });
    if (!r.ok) throw new Error(`Ollama responded ${r.status}`);
    const data = (await r.json()) as { response?: string };
    res.json({ english: (data.response ?? "").trim() });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

/** Opens a scenario at the given level, used for "New situation". */
app.post("/api/chat/scenario", async (req, res) => {
  const level = isLevel(req.body?.level) ? req.body.level : DEFAULT_LEVEL;

  const prompts = [
    "Zaproponuj jedną krótką sytuację do przećwiczenia po polsku. Zacznij od zwrotu Ćwiczmy sytuację i podaj w cudzysłowie polskie zdanie, które usłyszy uczeń. Maksymalnie 3 zdania.",
    "Zaproponuj jedną krótką sytuację: rozmowa w kawiarni. Zacznij od zwrotu Ćwiczmy sytuację i podaj w cudzysłowie polskie zdanie kelnera. Maksymalnie 3 zdania.",
    "Zaproponuj jedną krótką sytuację: zakupy w sklepie. Zacznij od zwrotu Ćwiczmy sytuację i podaj w cudzysłowie polskie zdanie sprzedawcy. Maksymalnie 3 zdania.",
    "Zaproponuj jedną krótką sytuację: rozmowa z lekarzem. Zacznij od zwrotu Ćwiczmy sytuację i podaj w cudzysłowie polskie zdanie lekarza. Maksymalnie 3 zdania.",
    "Zaproponuj jedną krótką sytuację: pierwszy dzień w pracy z nowym współpracownikiem. Zacznij od zwrotu Ćwiczmy sytuację i podaj w cudzysłowie polskie zdanie kolegi z pracy. Maksymalnie 3 zdania.",
    "Zaproponuj jedną krótką sytuację: pytanie o drogę na dworcu. Zacznij od zwrotu Ćwiczmy sytuację i podaj w cudzysłowie polskie zdanie kogoś ze wsi. Maksymalnie 3 zdania.",
  ];
  const topic = Math.floor(Math.random() * prompts.length);

  try {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: tutorPrompt(level) },
          { role: "user", content: prompts[topic - 1] },
        ],
        stream: false,
        options: { temperature: 0.8, num_predict: 160 },
      }),
    });
    if (!r.ok) throw new Error(`Ollama responded ${r.status}`);
    const data = (await r.json()) as { message?: { content?: string } };
    res.json({ text: (data.message?.content ?? "").trim() || GREETING });
  } catch (err) {
    // The UI still works without a generated scenario.
    res.json({ text: GREETING, error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`poligem server  http://localhost:${PORT}`);
  console.log(`  ollama  ${OLLAMA_URL}`);
  console.log(`  model   ${MODEL}`);
  // Pools start with the curated set, then generated exercises replace it.
  warmAll();
});