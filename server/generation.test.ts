import { describe, expect, it } from "vitest";
import { parseExercises } from "./generation";

describe("parseExercises", () => {
  it("parses a clean JSON array", () => {
    const raw = `[{"type":"en2pl","prompt":"I want tea.","answer":"Chcę herbatę.","explanation":"Herbata."}]`;
    const out = parseExercises(raw, "en2pl");
    expect(out).toHaveLength(1);
    expect(out[0].answer).toBe("Chcę herbatę.");
  });

  it("strips markdown code fences", () => {
    const raw = '```json\n[{"type":"en2pl","prompt":"a","answer":"b"}]\n```';
    expect(parseExercises(raw, "en2pl")).toHaveLength(1);
  });

  it("recovers an array wrapped in prose", () => {
    const raw = 'Sure! Here you go:\n[{"type":"en2pl","prompt":"a","answer":"b"}]\nHope that helps.';
    expect(parseExercises(raw, "en2pl")).toHaveLength(1);
  });

  it("returns empty for malformed JSON rather than throwing", () => {
    expect(parseExercises("{not json", "en2pl")).toEqual([]);
    expect(parseExercises("[unclosed", "en2pl")).toEqual([]);
    expect(parseExercises("", "en2pl")).toEqual([]);
  });

  it("drops items missing prompt or answer", () => {
    const raw = `[{"type":"en2pl","prompt":"ok","answer":"fine"},{"type":"en2pl","prompt":"no answer"}]`;
    expect(parseExercises(raw, "en2pl")).toHaveLength(1);
  });

  // Guards a real failure mode: a self-reported type mismatch would grade a
  // Polish→English answer against an English→Polish key.
  it("trusts the requested type over the model's own claim", () => {
    const raw = `[{"type":"en2pl","prompt":"Dzień dobry","answer":"Good morning"}]`;
    const out = parseExercises(raw, "pl2en");
    expect(out[0].type).toBe("pl2en");
  });

  describe("cloze post-processing", () => {
    it("blanks the answer word and returns it as the answer", () => {
      const raw = `[{"type":"cloze","prompt":"Cześć, jak się masz?","answer":"jak"}]`;
      const out = parseExercises(raw, "cloze");
      expect(out).toHaveLength(1);
      expect(out[0].prompt).toBe("Cześć, ___ się masz?");
      expect(out[0].answer).toBe("jak");
    });

    it("yields exactly one gap even if the model inserts its own blank", () => {
      const raw = `[{"type":"cloze","prompt":"Idę ___ kawiarni","answer":"do"}]`;
      const out = parseExercises(raw, "cloze");
      expect((out[0].prompt.match(/___/g) ?? []).length).toBe(1);
      expect(out[0].answer).toBe("do");
    });

    it("matches the answer case-insensitively", () => {
      // Answer in upper case AND in a different Unicode form (precomposed Ó
      // vs the combining-accent spelling) than the sentence. NFC must make
      // these compare equal, otherwise a correct answer is marked wrong.
      const decomposed = "dwo" + "́" + "ch";
      const raw = `[{"type":"cloze","prompt":"Mam dwóch braci.","answer":"${decomposed.toUpperCase()}"}]`;
      const out = parseExercises(raw, "cloze");
      expect(out[0].prompt).toBe("Mam ___ braci.");
      expect(out[0].answer).toBe("dwóch");
    });

    it("falls back to a content word when the answer is not in the sentence", () => {
      const raw = `[{"type":"cloze","prompt":"Piję kawę rano.","answer":"herbata"}]`;
      const out = parseExercises(raw, "cloze");
      expect(out).toHaveLength(1);
      expect(out[0].prompt).toContain("___");
      // The model's answer was unusable, so a real word was chosen instead.
      expect(out[0].answer).not.toBe("herbata");
    });

    it("preserves Polish diacritics through blanking", () => {
      const raw = `[{"type":"cloze","prompt":"Poproszę kawę z mlekiem.","answer":"mlekiem"}]`;
      const out = parseExercises(raw, "cloze");
      expect(out[0].prompt).toBe("Poproszę kawę z ___.");
      expect(out[0].answer).toBe("mlekiem");
    });
  });
});
