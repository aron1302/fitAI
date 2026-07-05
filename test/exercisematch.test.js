import { describe, it, expect } from "vitest";
import { bestMatch, tokenize } from "../server/lib/freeexercisedb.js";

// Build dataset entries the way loadDataset does (name + precomputed tokens).
const entry = (name) => ({ name, _tokens: tokenize(name) });

const dataset = [
  entry("Exercise Ball Crunch"),
  entry("Triceps Pushdown"),
  entry("Triceps Pushdown - Rope Attachment"),
  entry("Hammer Curls"),
  entry("Side Lateral Raise"),
  entry("Barbell Squat"),
];

describe("bestMatch", () => {
  it("matches real exercise names, tolerating plural/singular variants", () => {
    expect(bestMatch(dataset, "Tricep pushdowns")?.name).toBe("Triceps Pushdown");
    expect(bestMatch(dataset, "Bicep hammer curls")?.name).toBe("Hammer Curls");
    expect(bestMatch(dataset, "Lateral raises")?.name).toBe("Side Lateral Raise");
  });

  it("matches single-word names on one token", () => {
    expect(bestMatch(dataset, "Squats")?.name).toBe("Barbell Squat");
  });

  it("rejects multi-word names that share only one generic word", () => {
    // "New exercise" must not resolve to "Exercise Ball Crunch" — a wrong
    // photo is worse than the placeholder tile.
    expect(bestMatch(dataset, "New exercise")).toBeNull();
    expect(bestMatch(dataset, "Weird ball thing")).toBeNull();
  });

  it("returns null for empty or stop-word-only names", () => {
    expect(bestMatch(dataset, "")).toBeNull();
    expect(bestMatch(dataset, "with the")).toBeNull();
  });
});
