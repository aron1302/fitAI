import { describe, it, expect } from "vitest";
import {
  generateWorkoutPlan,
  generateDietPlan,
  generateRecoveryPlan,
  coachReply,
} from "../server/lib/fallback.js";
import { WorkoutPlanSchema, DietPlanSchema, RecoveryPlanSchema } from "../server/lib/schemas.js";

const profile = {
  name: "Sam",
  sex: "male",
  weightKg: 80,
  heightCm: 178,
  age: 30,
  goal: "recomp",
  activityLevel: "moderate",
  daysPerWeek: 4,
  experience: "intermediate",
  impairments: [],
};

const highReadiness = { readiness: 90 };
const lowReadiness = { readiness: 20 };

describe("generateWorkoutPlan", () => {
  it("produces a schema-valid plan", () => {
    expect(() =>
      WorkoutPlanSchema.parse(generateWorkoutPlan(profile, highReadiness))
    ).not.toThrow();
  });

  it("respects daysPerWeek", () => {
    expect(generateWorkoutPlan({ ...profile, daysPerWeek: 3 }, highReadiness).days).toHaveLength(3);
    expect(generateWorkoutPlan({ ...profile, daysPerWeek: 5 }, highReadiness).days).toHaveLength(5);
  });

  it("deloads to low intensity when readiness is low", () => {
    const plan = generateWorkoutPlan(profile, lowReadiness);
    expect(plan.days.every((d) => d.intensity === "low")).toBe(true);
  });

  it("flags exercises around a noted impairment", () => {
    const injured = generateWorkoutPlan(
      { ...profile, daysPerWeek: 3, impairments: ["knee pain"] },
      highReadiness
    );
    const allNotes = injured.days.flatMap((d) => d.exercises.map((e) => e.notes || ""));
    expect(allNotes.some((n) => n.includes("⚠"))).toBe(true);
    expect(injured.cautions).toMatch(/knee pain/);
  });
});

describe("generateDietPlan", () => {
  it("produces a schema-valid plan", () => {
    expect(() => DietPlanSchema.parse(generateDietPlan(profile))).not.toThrow();
  });

  it("orders daily calories by goal", () => {
    const loss = generateDietPlan({ ...profile, goal: "weight_loss" }).daily_calories;
    const gain = generateDietPlan({ ...profile, goal: "muscle_gain" }).daily_calories;
    expect(loss).toBeLessThan(gain);
  });

  it("meal calories roughly sum to the daily target", () => {
    const plan = generateDietPlan(profile);
    const total = plan.meals.reduce((s, m) => s + m.calories, 0);
    expect(Math.abs(total - plan.daily_calories)).toBeLessThanOrEqual(5); // rounding only
  });
});

describe("generateRecoveryPlan", () => {
  it("produces a schema-valid plan", () => {
    expect(() =>
      RecoveryPlanSchema.parse(generateRecoveryPlan(profile, highReadiness))
    ).not.toThrow();
  });

  it("recommends full rest when readiness is low", () => {
    const plan = generateRecoveryPlan(profile, lowReadiness);
    expect(plan.recovery_status).toMatch(/rest/i);
    expect(plan.estimated_recovery_hours).toBeGreaterThan(0);
  });
});

describe("coachReply", () => {
  it("answers protein questions with a bodyweight-derived target", () => {
    const reply = coachReply(profile, [
      { role: "user", content: "how much protein should I eat?" },
    ]);
    expect(reply).toMatch(/protein/i);
    expect(reply).toMatch(/\d+g/);
  });

  it("always returns a non-empty string", () => {
    expect(coachReply(profile, [{ role: "user", content: "hello" }]).length).toBeGreaterThan(0);
  });
});
