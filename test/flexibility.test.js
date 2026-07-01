import { describe, it, expect } from "vitest";
import { flexibilitySuggestions } from "../client/src/lib/flexibility.js";

const base = { age: 30, goal: "recomp", impairments: [] };
const senior = { ...base, age: 62 };

describe("flexibilitySuggestions", () => {
  it("adds balance work and 50+ guidance for older users", () => {
    const f = flexibilitySuggestions(senior, { readiness: 80, soreness: 2 });
    expect(f.senior).toBe(true);
    expect(f.ageGuidance).toBeTruthy();
    expect(f.routine.some((d) => d.type === "Balance")).toBe(true);
    expect(f.focusAreas.some((a) => /balance/i.test(a))).toBe(true);
  });

  it("omits balance work and 50+ guidance for younger users", () => {
    const f = flexibilitySuggestions(base, { readiness: 80, soreness: 2 });
    expect(f.ageGuidance).toBe(null);
    expect(f.routine.some((d) => d.type === "Balance")).toBe(false);
  });

  it("goes gentle/restorative when very sore", () => {
    const f = flexibilitySuggestions(base, { readiness: 80, soreness: 5 });
    expect(f.summary).toMatch(/gentle/i);
    expect(f.cautions.some((w) => /restorative|gentle/i.test(w))).toBe(true);
  });

  it("adds a back-care caution for a back impairment", () => {
    const f = flexibilitySuggestions({ ...base, impairments: ["lower back disc"] }, { soreness: 2 });
    expect(f.cautions.some((w) => /spinal|leg/i.test(w))).toBe(true);
  });

  it("always returns a non-empty routine", () => {
    expect(flexibilitySuggestions(base, {}).routine.length).toBeGreaterThan(0);
  });
});
