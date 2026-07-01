import { describe, it, expect } from "vitest";
import {
  bmr,
  tdee,
  nutritionTargets,
  readinessScore,
  readinessBand,
} from "../server/lib/targets.js";

const baseProfile = {
  sex: "male",
  weightKg: 80,
  heightCm: 178,
  age: 30,
  activityLevel: "moderate",
};

describe("bmr (Mifflin-St Jeor)", () => {
  it("computes male BMR", () => {
    // 10*80 + 6.25*178 - 5*30 + 5 = 1767.5 -> 1768
    expect(bmr(baseProfile)).toBe(1768);
  });

  it("applies the female offset (-161 vs +5)", () => {
    expect(bmr({ ...baseProfile, sex: "male" }) - bmr({ ...baseProfile, sex: "female" })).toBe(166);
  });
});

describe("tdee", () => {
  it("scales BMR by the activity factor", () => {
    expect(tdee(baseProfile)).toBe(Math.round(1768 * 1.55));
  });

  it("defaults to the 'light' factor for an unknown activity level", () => {
    expect(tdee({ ...baseProfile, activityLevel: "nonsense" })).toBe(Math.round(1768 * 1.375));
  });
});

describe("nutritionTargets", () => {
  it("orders calories by goal: weight_loss < maintain < muscle_gain", () => {
    const loss = nutritionTargets({ ...baseProfile, goal: "weight_loss" }).calories;
    const maintain = nutritionTargets({ ...baseProfile, goal: "maintain" }).calories;
    const gain = nutritionTargets({ ...baseProfile, goal: "muscle_gain" }).calories;
    expect(loss).toBeLessThan(maintain);
    expect(maintain).toBeLessThan(gain);
  });

  it("sets protein from bodyweight and goal (2.0 g/kg for muscle_gain)", () => {
    const t = nutritionTargets({ ...baseProfile, goal: "muscle_gain" });
    expect(t.proteinG).toBe(160); // 80kg * 2.0
  });

  it("never returns negative carbs", () => {
    const t = nutritionTargets({ ...baseProfile, weightKg: 200, goal: "weight_loss" });
    expect(t.carbsG).toBeGreaterThanOrEqual(0);
  });
});

describe("readinessScore", () => {
  it("clamps to the 5-100 range", () => {
    const lowest = readinessScore({
      sleepHours: 0,
      restingHr: 100,
      hrv: 10,
      soreness: 5,
      stress: 5,
      hoursSinceWorkout: 0,
    });
    const highest = readinessScore({
      sleepHours: 10,
      restingHr: 40,
      hrv: 100,
      soreness: 1,
      stress: 1,
      hoursSinceWorkout: 72,
    });
    expect(lowest).toBeGreaterThanOrEqual(5);
    expect(highest).toBeLessThanOrEqual(100);
    expect(highest).toBeGreaterThan(lowest);
  });

  it("rewards better sleep", () => {
    const poor = readinessScore({ sleepHours: 4 });
    const good = readinessScore({ sleepHours: 9 });
    expect(good).toBeGreaterThan(poor);
  });
});

describe("readinessBand", () => {
  it("maps scores to bands at the right thresholds", () => {
    expect(readinessBand(85)).toBe("peak");
    expect(readinessBand(80)).toBe("peak");
    expect(readinessBand(70)).toBe("ready");
    expect(readinessBand(60)).toBe("ready");
    expect(readinessBand(50)).toBe("moderate");
    expect(readinessBand(40)).toBe("moderate");
    expect(readinessBand(39)).toBe("low");
    expect(readinessBand(5)).toBe("low");
  });
});
