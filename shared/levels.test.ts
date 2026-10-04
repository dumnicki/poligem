import { describe, expect, it } from "vitest";
import { deriveLevel, isLevel } from "./levels";
import type { Attempt } from "../src/types";

const attempt = (correct: boolean): Attempt => ({
  type: "cloze",
  prompt: "x",
  answer: "y",
  correct,
  at: 0,
});

const many = (correct: number, total: number) =>
  Array.from({ length: total }, (_, i) => attempt(i < correct));

describe("deriveLevel", () => {
  it("defaults to A2 without enough evidence", () => {
    // Two lucky answers must not promote or demote anyone.
    expect(deriveLevel([])).toBe("A2");
    expect(deriveLevel([attempt(true), attempt(true)])).toBe("A2");
  });

  it("drops to A1 on sustained low accuracy", () => {
    expect(deriveLevel(many(2, 10))).toBe("A1");
  });

  it("holds A2 in the middle band", () => {
    expect(deriveLevel(many(6, 10))).toBe("A2");
  });

  it("promotes to B1 only with volume as well as accuracy", () => {
    expect(deriveLevel(many(18, 20))).toBe("B1");
    // 100% but only 8 answers: not enough to promote.
    expect(deriveLevel(many(8, 8))).toBe("A2");
  });

  it("judges only the recent window, not lifetime history", () => {
    // A long bad streak followed by a good run should recover. deriveLevel
    // receives a pre-sliced window from the caller, so pass the window here.
    expect(deriveLevel(many(12, 12))).toBe("B1");
    expect(deriveLevel(many(1, 10))).toBe("A1");
  });
});

describe("isLevel", () => {
  it("accepts known levels", () => {
    expect(isLevel("A1")).toBe(true);
    expect(isLevel("B1")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLevel("C2")).toBe(false);
    expect(isLevel(null)).toBe(false);
    expect(isLevel(3)).toBe(false);
  });
});
