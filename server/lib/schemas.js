// Zod schemas for the two trust boundaries that can crash the app:
//   1. inbound request bodies (client -> server)
//   2. AI-generated plans (model -> server -> client render)
//
// AI-output schemas validate the *renderable* structure (the arrays/objects the
// React pages index into) but stay lenient on free-text fields and allow extra
// keys, so a valid-but-chatty model response isn't needlessly rejected and sent
// to the fallback. If the core shape is wrong, parsing throws and the caller
// falls back to the deterministic rule-based engine.

import { z } from "zod";

const num = z.number().finite();

// ---- Inbound requests ----

export const ProfileSchema = z
  .object({
    name: z.string().optional(),
    age: num.optional(),
    sex: z.string().optional(),
    heightCm: num.optional(),
    weightKg: num.optional(),
    goal: z.string().optional(),
    activityLevel: z.string().optional(),
    daysPerWeek: num.optional(),
    experience: z.string().optional(),
    impairments: z.array(z.string()).optional(),
    trainingDays: z.array(z.number().int().min(0).max(6)).optional(),
    onboarded: z.boolean().optional(),
  })
  .passthrough();

export const RecoverySchema = z
  .object({
    sleepHours: num.optional(),
    restingHr: num.optional(),
    hrv: num.optional(),
    soreness: num.optional(),
    stress: num.optional(),
    hoursSinceWorkout: num.optional(),
    readiness: num.optional(),
  })
  .passthrough()
  .nullable()
  .optional();

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});
export const MessagesSchema = z.array(MessageSchema).min(1);

export const PlanKindSchema = z.enum(["diet", "recovery", "workout"]);

// ---- AI plan outputs ----

const text = z.string().optional();

export const WorkoutPlanSchema = z
  .object({
    summary: text,
    weekly_focus: text,
    days: z
      .array(
        z
          .object({
            day: z.string(),
            focus: text,
            intensity: text,
            duration_min: num.optional(),
            exercises: z
              .array(
                z
                  .object({
                    name: z.string(),
                    sets: z.union([num, z.string()]).optional(),
                    reps: z.union([num, z.string()]).optional(),
                    notes: text,
                  })
                  .passthrough()
              )
              .default([]),
          })
          .passthrough()
      )
      .min(1),
    readiness_guidance: text,
    cautions: text,
  })
  .passthrough();

export const DietPlanSchema = z
  .object({
    summary: text,
    daily_calories: num,
    macros: z.object({ protein_g: num, carbs_g: num, fat_g: num }).passthrough(),
    meals: z
      .array(
        z
          .object({
            name: z.string(),
            time: z.string().optional(),
            items: z.array(z.string()).default([]),
            calories: num.optional(),
            protein_g: num.optional(),
          })
          .passthrough()
      )
      .min(1),
    hydration: text,
    notes: text,
  })
  .passthrough();

export const RecoveryPlanSchema = z
  .object({
    summary: text,
    recovery_status: text,
    estimated_recovery_hours: num.optional(),
    sleep_target_hours: num.optional(),
    focus_areas: z.array(z.string()).default([]),
    recommendations: z
      .array(z.object({ title: z.string(), detail: z.string() }).passthrough())
      .default([]),
    hydration_nutrition: text,
  })
  .passthrough();

export const PLAN_SCHEMAS = {
  workout: WorkoutPlanSchema,
  diet: DietPlanSchema,
  recovery: RecoveryPlanSchema,
};

// Result of the "plan as you go" meal analysis (model -> server -> client).
// Macro fields are coerced/rounded so a model answering "310.5" still passes.
const roundedNum = z.coerce.number().finite().transform((v) => Math.round(v));
export const MealAnalysisSchema = z
  .object({
    meal: z
      .object({
        name: z.string().min(1),
        items: z.array(z.string()).default([]),
        calories: roundedNum,
        protein_g: roundedNum,
        carbs_g: roundedNum,
        fat_g: roundedNum,
        confidence: z.enum(["low", "medium", "high"]).catch("medium"),
        assumptions: z.string().optional().default(""),
      })
      .passthrough(),
    guidance: z.string(),
  })
  .passthrough();

// Result of an AI-judged plan edit.
export const SuggestEditResultSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string(),
    plan: z.unknown().optional(),
  })
  .passthrough();
