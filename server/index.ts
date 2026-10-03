import express from "express";
import cors from "cors";
import { SYSTEM_PROMPT } from "./prompt.js";

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

app.listen(PORT, () => {
  console.log(`poligem server  http://localhost:${PORT}`);
  console.log(`  ollama  ${OLLAMA_URL}`);
  console.log(`  model   ${MODEL}`);
});