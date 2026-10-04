import express from "express";
import cors from "cors";
import { OLLAMA_URL, MODEL, PORT } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
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

app.listen(PORT, () => {
  console.log(`poligem server  http://localhost:${PORT}`);
  console.log(`  ollama  ${OLLAMA_URL}`);
  console.log(`  model   ${MODEL}`);
  // Pools start with the curated set, then generated exercises replace it.
  warmAll();
});