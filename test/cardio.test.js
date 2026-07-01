import { describe, it, expect } from "vitest";
import { heartRateZones, cardioSuggestions } from "../client/src/lib/cardio.js";

const base = {
  age: 30,
  weightKg: 80,
  goal: "maintain",
  activityLevel: "moderate",
  impairments: [],
};
const senior = { ...base, age: 62 };
const highReadiness = { readiness: 90, restingHr: 55 };
const lowReadiness = { readiness: 20, restingHr: 70 };

describe("heartRateZones", () => {
  it("computes max HR via Tanaka and returns 5 ordered zones", () => {
    const z = heartRateZones(base, { restingHr: 60 });
    expect(z.hrMax).toBe(187); // 208 - 0.7*30
    expect(z.zones).toHaveLength(5);
    // zones increase in intensity
    for (let i = 1; i < z.zones.length; i++) {
      expect(z.zones[i].low).toBeGreaterThanOrEqual(z.zones[i - 1].low);
    }
  });

  it("lowers max HR for older users", () => {
    expect(heartRateZones(senior, {}).hrMax).toBe(Math.round(208 - 0.7 * 62));
  });
});

describe("cardioSuggestions", () => {
  it("adds 50+ guidance and a doctor caution for older users", () => {
    const c = cardioSuggestions(senior, highReadiness);
    expect(c.senior).toBe(true);
    expect(c.ageGuidance).toBeTruthy();
    expect(c.cautions.some((w) => /doctor/i.test(w))).toBe(true);
  });

  it("omits 50+ guidance for younger users", () => {
    expect(cardioSuggestions(base, highReadiness).ageGuidance).toBe(null);
  });

  it("keeps older users to low-impact modalities (no running)", () => {
    const c = cardioSuggestions(senior, highReadiness);
    const text = c.sessions.map((s) => s.type).join(" ");
    expect(/jog|run/i.test(text)).toBe(false);
  });

  it("caps everything to easy zones when readiness is low", () => {
    const c = cardioSuggestions(base, lowReadiness);
    expect(c.maxZone).toBeLessThanOrEqual(2);
    expect(c.sessions.every((s) => s.zone <= 2)).toBe(true);
  });

  it("keeps cardio light for a muscle-gain goal", () => {
    const c = cardioSuggestions({ ...base, goal: "muscle_gain" }, highReadiness);
    expect(Math.max(...c.sessions.map((s) => s.zone))).toBeLessThanOrEqual(2);
  });

  it("always returns at least one session", () => {
    expect(cardioSuggestions(base, lowReadiness).sessions.length).toBeGreaterThan(0);
  });
});
