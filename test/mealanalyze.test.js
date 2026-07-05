import { describe, it, expect } from "vitest";
import { MealAnalysisSchema } from "../server/lib/schemas.js";
import { mealAnalyzeUser } from "../server/lib/promptContext.js";

const validMeal = {
  meal: {
    name: "Paneer curry with chapatis",
    items: ["2 chapatis", "paneer curry (1 bowl)", "curd (small bowl)"],
    calories: 620,
    protein_g: 28,
    carbs_g: 55,
    fat_g: 30,
    confidence: "medium",
    assumptions: "Assumed a medium bowl of curry with ~100g paneer.",
  },
  guidance: "You have about 1,200 kcal left today — keep dinner lean and protein-forward.",
};

describe("MealAnalysisSchema", () => {
  it("accepts a well-formed analysis", () => {
    const parsed = MealAnalysisSchema.parse(validMeal);
    expect(parsed.meal.calories).toBe(620);
    expect(parsed.guidance).toMatch(/1,200 kcal/);
  });

  it("rounds fractional macro numbers from the model", () => {
    const parsed = MealAnalysisSchema.parse({
      ...validMeal,
      meal: { ...validMeal.meal, calories: 619.6, protein_g: "28.2" },
    });
    expect(parsed.meal.calories).toBe(620);
    expect(parsed.meal.protein_g).toBe(28);
  });

  it("defaults an unknown confidence to medium instead of rejecting", () => {
    const parsed = MealAnalysisSchema.parse({
      ...validMeal,
      meal: { ...validMeal.meal, confidence: "very sure" },
    });
    expect(parsed.meal.confidence).toBe("medium");
  });

  it("rejects a response with no guidance or no meal name", () => {
    expect(() => MealAnalysisSchema.parse({ meal: validMeal.meal })).toThrow();
    expect(() =>
      MealAnalysisSchema.parse({ ...validMeal, meal: { ...validMeal.meal, name: "" } })
    ).toThrow();
  });
});

describe("mealAnalyzeUser prompt builder", () => {
  const profile = { age: 30, sex: "male", heightCm: 178, weightKg: 80, goal: "recomp" };

  it("includes the description, targets, and eaten-so-far context", () => {
    const prompt = mealAnalyzeUser(
      "2 eggs and toast",
      profile,
      { calories: 2200, proteinG: 160, carbsG: 220, fatG: 65 },
      [{ name: "Oats breakfast", calories: 420, protein_g: 22 }]
    );
    expect(prompt).toContain('"""2 eggs and toast"""');
    expect(prompt).toContain("2200 kcal");
    expect(prompt).toContain("Oats breakfast (~420 kcal, 22 g protein)");
  });

  it("asks the model to use the photo when there is no description", () => {
    expect(mealAnalyzeUser("", profile)).toContain("attached photo");
  });

  it("sanitises client-supplied numbers and caps the eaten list", () => {
    const eaten = Array.from({ length: 30 }, (_, i) => ({
      name: `meal ${i}`,
      calories: "not-a-number",
      protein_g: -5,
    }));
    const prompt = mealAnalyzeUser("salad", profile, { calories: "2e9zz" }, eaten);
    expect(prompt).toContain("meal 14");
    expect(prompt).not.toContain("meal 15");
    expect(prompt).toContain("~0 kcal");
    expect(prompt).not.toContain("NaN");
  });
});
