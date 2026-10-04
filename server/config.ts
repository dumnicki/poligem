/**
 * Central configuration.
 *
 * Every value has a working default so the app runs with no .env file at all.
 * Kept separate because both the HTTP layer and the pool need these.
 */
try {
  process.loadEnvFile();
} catch {
  // no .env file — use defaults / real environment
}

export const PORT = Number(process.env.PORT ?? 3001);
export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
export const MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

/**
 * How many exercises per type the server tries to keep ready at all times.
 *
 * Three is enough that a learner working at normal pace never empties the pool
 * before a replacement lands: one generation takes roughly 10-15s, while
 * answering one exercise takes longer than that.
 */
export const POOL_TARGET = Math.min(
  Math.max(Number(process.env.POOL_TARGET ?? 3) || 3, 1),
  8,
);