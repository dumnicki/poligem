# poligem

A Polish conversation practice app that runs entirely on your own machine.

`poligem` pairs a free chat tutor with structured drills for Polish learners.
The conversation core is **Gemma 3 (4B) running locally through Ollama** — no
accounts, no API keys, no data leaving your laptop.

---

## Why it runs locally

Polish learners are often self-studying, which means:

- **The conversation is private.** Every sentence you type — including mistakes,
  and often your name, your work, your partner — stays on your machine. Nothing
  is sent to a third party.
- **It is free.** Ollama and Gemma 3 carry no per-token cost, so the app is not
  gated behind a subscription and does not degrade after a trial period.
- **The tutor is a file, not a service.** The entire teaching personality —
  level handling, scenario framing, correction style, translation behaviour —
  lives in [`server/prompt.ts`](server/prompt.ts). Changing how `poligem` teaches
  Polish is editing one file. No prompt-injection surface from a shared endpoint,
  no vendor changing your model under you.
- **It can be tuned to you.** Point it at a different model, add your own
  vocabulary, or adjust the level without asking anyone's permission.

The trade-off is honest: a 4B model on CPU is fast enough to be pleasant to talk
to, but it is not a frontier model. It makes mistakes. Where a mistake would teach
the learner something false, the app handles it explicitly — see
[Cloze blanks](#cloze-blanks-are-applied-by-the-server-not-the-model) below.

---

## Requirements

| | |
|---|---|
| **Ollama** | Running, with `gemma3:4b` pulled |
| **Node.js** | 20+ (developed on 25.2) |
| **RAM** | 8 GB minimum, 16 GB comfortable |
| **GPU** | Optional — it runs on CPU, just slower |

```bash
ollama serve                 # if not already running
ollama pull gemma3:4b
```

Already have a different model? `qwen3.5:4b` also works well. Set it in `.env`
(see [Configuration](#configuration)).

---

## Setup

```bash
git clone https://github.com/dumnicki/poligem.git
cd poligem
npm install
npm run dev
```

Then open **http://localhost:5173**.

> On some Windows machines Vite binds IPv6 only. Use `localhost`, not
> `127.0.0.1` — the IPv4 literal refuses the connection even though the server is
> running fine.

### Commands

```bash
npm run dev          # server + web together
npm run dev:web      # frontend only, :5173
npm run dev:server   # Express proxy only, :3001
npm test             # unit tests
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production bundle
```

---

## Architecture

```
  Browser (React 19 + Vite)
          │
          │  /api/*  (Vite proxies to 3001 in dev)
          ▼
  Express (Node + TypeScript)  ──────────────┐
          │                                   │
          │  /api/chat        (streamed NDJSON)│
          │  /api/exercise/*  (pool reads)     │  /api/chat/translate
          │  /api/chat/scenario                │  /api/chat/scenario
          ▼                                   │
  Exercise pool ──► gemma3:4b ◄───────────────┘
   (3 per type,        via Ollama
    self-refilling)        │
                            ▼
                     localhost:11434
```

Three tabs in the sidebar: **Chat**, **Exercises**, **Progress**.

### Why the Express proxy

Ollama's CORS is permissive, so the browser could call it directly. The proxy
exists anyway:

1. The client never depends on Ollama's API contract, so the model can be swapped
   without touching React.
2. `server/prompt.ts` stays the single source of truth for tutor behaviour.
3. It is where the serialisation queue and the exercise pool live.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Is Ollama up, is the model pulled |
| `POST` | `/api/chat` | Streamed tutor reply (NDJSON) |
| `POST` | `/api/chat/scenario` | Open a fresh roleplay situation |
| `POST` | `/api/chat/translate` | Translate one Polish utterance to English |
| `GET` | `/api/exercise/next` | Take the next exercise from the pool |
| `POST` | `/api/exercise/report` | Record an answer, feeding weakness tracking |
| `GET` | `/api/exercises/status` | Pool depth, generations in flight |
| `POST` | `/api/exercise/generate` | Force a generation (debugging) |

---

## How it works

### Chat: situations, not questions

Rather than "what would you like to talk about?", the tutor opens a **scene**:

> Ćwiczmy. Wyobraź sobie, że jesteś w kawiarni, a kelner podchodzi i mówi:
> *„Dzień dobry, co podać?"* — co odpowiesz?

It then stays in role and asks one natural follow-up at a time. Polish sentences
are wrapped in quotes so the learner can see exactly what was said.

A beginner who does not understand can either **press EN** under any sentence for
an English translation, or simply type *„co to znaczy?"* and get an explanation.
Both paths exist because people try both.

### Adaptive level

There is no level setting buried in a config file. `poligem` derives **A1 / A2 /
B1** from your recent accuracy (`shared/levels.ts`), and you can override it in
the sidebar. The derived level is deliberately conservative: it needs 6 answers
before moving at all, and 12 before promoting, so a lucky streak does not skip
you ahead or a bad morning does not knock you back.

### Exercises: a pool that never empties

`server/pool.ts` keeps **three exercises of each type ready at all times** and
refills them in the background. Taking an exercise is an array shift, not a model
call — measured **45–167 ms** against roughly 35 s for a cold generation.

```
English → Polish    translate EN into Polish
Polish → English    translate PL into English
Fill the gap        one missing word in a Polish sentence
```

Because the pool is warm, the first exercise appears immediately after the server
boots. If Ollama is down, the curated seed exercises are served instead, rotating
so the same sentence never appears twice in a row.

### Weakness feedback

Each answer is reported to the server, which tracks which prompts you miss and
feeds the worst offenders into the next generation. Refills are therefore
targeted at your weak spots rather than repeating one difficulty.

---

## Notes on quality

These are deliberate choices, not accidents. Each one exists because the obvious
implementation produced something wrong.

**Cloze blanks are applied by the server, not the model.** The model reliably
returns a complete Polish sentence plus a target word, but inconsistently blanks
it. So the server locates the answer word and blanks it deterministically. When
the model *does* insert its own gap, that position is kept — it already solved
the exercise correctly. `server/generation.ts`, covered by tests.

**Refills generate in batches of three.** Asking for a single exercise
measurably degraded quality: cloze came back as fragments with meaningless gaps
(*"Nie rozumiem, ___ mówi on"*). The model needs several examples to imitate
structure.

**All model calls are serialised.** A 4B model on CPU does not run two requests in
parallel — they interleave and both slow down, and a background refill would
stall your conversation. One queue in `server/generation.ts`.

**Answers are compared in NFC Unicode form.** `ó` can be one codepoint (`U+00F3`)
or `o` plus a combining accent. They look identical and compare unequal, which
would mark correct answers wrong.

**Polish diacritics are never stripped when grading.** `kawa` and `kawę` are
different words. Case and trailing punctuation fold; characters do not.

**UTF-8 is explicit at every layer** — the HTML `charset`, the Express response
header, and the browser `TextDecoder`. Mojibake in Polish is immediately obvious
and would undermine the whole app.

---

## Configuration

Every value has a working default; `.env` is optional. Copy `.env.example` to
override.

| Variable | Default | Notes |
|---|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Where Ollama listens |
| `OLLAMA_MODEL` | `gemma3:4b` | `qwen3.5:4b` also works |
| `PORT` | `3001` | Express proxy |
| `POOL_TARGET` | `3` | Exercises kept ready per type |

---

## Deploying

`poligem` is local-first by design, and that is the point: the strongest argument
for open-weight models is a polished app that needs no server at all.

Deploying the app means also hosting Ollama and paying for the RAM a 4B model
needs (roughly 4–5 GB), which free tiers do not provide. A hosted deployment is
possible but trades away the privacy and cost arguments above. For a demo, a
screen recording plus this repository tells the story more honestly.

---

## Licence

MIT — see [LICENSE](LICENSE).

Built with [gemma3:4b](https://ai.google.dev/gemma) by Google, served locally
via [Ollama](https://ollama.com).
