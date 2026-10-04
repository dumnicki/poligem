import { describe, expect, it } from "vitest";
import { grade } from "./grade";

describe("grade", () => {
  it("accepts the exact answer regardless of case and trailing punctuation", () => {
    expect(grade("Poproszę kawę.", "poproszę kawę")).toBe("correct");
    expect(grade("Poproszę kawę", "Poproszę kawę.")).toBe("correct");
  });

  it("treats Polish diacritics as significant", () => {
    // kawę vs kawa are different words; this must NOT pass.
    expect(grade("kawę", "kawa")).toBe("wrong");
    expect(grade("mlekiem", "mleko")).toBe("wrong");
  });

  it("accepts a near-miss multi-word translation as close", () => {
    // One content word off out of five: 4/5 = 0.8, at the threshold.
    expect(grade("Chcę kawę z mlekiem", "Chcę kawę z cukrem")).toBe("wrong");
    expect(grade("Poproszę kawę proszę", "Poproszę kawę proszę bardzo")).toBe("close");
  });

  it("ignores dropped English stopwords", () => {
    expect(grade("I want a coffee", "I want coffee")).toBe("close");
  });

  it("never returns close for a single-word answer", () => {
    // Otherwise a one-word answer would pass on partial token overlap.
    expect(grade("jak", "ja")).toBe("wrong");
    expect(grade("Idę", "ide")).toBe("wrong");
  });

  it("marks an empty answer wrong", () => {
    expect(grade("cokolwiek", "   ")).toBe("wrong");
  });

  it("matches across precomposed and decomposed Unicode forms", () => {
    // "ó" as U+00F3 vs "o" + combining acute U+0301. These render the same but
    // are not equal strings; without NFC normalisation a correct answer fails.
    const decomposed = "kaw" + "ę".normalize("NFD");
    expect(grade("kawę", decomposed)).toBe("correct");
  });

  it("is order-insensitive when judging overlap", () => {
    expect(grade("Idę do kawiarni", "do kawiarni Idę")).toBe("close");
  });

  it("rejects an unrelated answer", () => {
    expect(grade("Poproszę kawę", "Idę do domu")).toBe("wrong");
  });
});
