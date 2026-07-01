import { describe, it, expect } from "vitest";
import {
  ProfileSchema,
  RecoverySchema,
  MessagesSchema,
  PlanKindSchema,
  DietPlanSchema,
  WorkoutPlanSchema,
} from "../server/lib/schemas.js";

describe("ProfileSchema", () => {
  it("accepts a partial profile and preserves extra keys", () => {
    const r = ProfileSchema.safeParse({ weightKg: 80, goal: "recomp", custom: 1 });
    expect(r.success).toBe(true);
    expect(r.data.custom).toBe(1); // passthrough
  });

  it("rejects a wrong field type", () => {
    expect(ProfileSchema.safeParse({ age: "old" }).success).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(ProfileSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("RecoverySchema", () => {
  it("allows null/undefined (recovery is optional)", () => {
    expect(RecoverySchema.safeParse(undefined).success).toBe(true);
    expect(RecoverySchema.safeParse(null).success).toBe(true);
  });
});

describe("MessagesSchema", () => {
  it("requires at least one message with a valid role", () => {
    expect(MessagesSchema.safeParse([]).success).toBe(false);
    expect(MessagesSchema.safeParse([{ role: "user", content: "hi" }]).success).toBe(true);
    expect(MessagesSchema.safeParse([{ role: "bogus", content: "hi" }]).success).toBe(false);
  });
});

describe("PlanKindSchema", () => {
  it("accepts only the three kinds", () => {
    for (const k of ["diet", "recovery", "workout"])
      expect(PlanKindSchema.safeParse(k).success).toBe(true);
    expect(PlanKindSchema.safeParse("snacks").success).toBe(false);
  });
});

describe("DietPlanSchema", () => {
  const valid = {
    daily_calories: 2200,
    macros: { protein_g: 160, carbs_g: 200, fat_g: 70 },
    meals: [{ name: "Breakfast", time: "8 AM", items: ["Oats"], calories: 500, protein_g: 30 }],
  };

  it("accepts a well-formed plan", () => {
    expect(DietPlanSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a plan with no meals", () => {
    expect(DietPlanSchema.safeParse({ ...valid, meals: [] }).success).toBe(false);
  });

  it("rejects a plan missing macros", () => {
    const { macros, ...noMacros } = valid;
    expect(DietPlanSchema.safeParse(noMacros).success).toBe(false);
  });

  it("defaults missing meal items to an empty array", () => {
    const r = DietPlanSchema.safeParse({ ...valid, meals: [{ name: "X" }] });
    expect(r.success).toBe(true);
    expect(r.data.meals[0].items).toEqual([]);
  });
});

describe("WorkoutPlanSchema", () => {
  it("requires at least one day", () => {
    expect(WorkoutPlanSchema.safeParse({ days: [] }).success).toBe(false);
    expect(
      WorkoutPlanSchema.safeParse({ days: [{ day: "Mon", exercises: [{ name: "Squat" }] }] })
        .success
    ).toBe(true);
  });
});
