// Anthropic Claude integration. Each function tries the real API and the caller
// falls back to the rule-based engine on any failure or when no key is set.

import Anthropic from "@anthropic-ai/sdk";
import {
  profileContext,
  WORKOUT_SYSTEM,
  DIET_SYSTEM,
  RECOVERY_SYSTEM,
  coachSystem,
  suggestSystem,
  suggestUser,
  CLASSIFY_SYSTEM,
  classifyUser,
} from "./promptContext.js";

const MODEL = "claude-opus-4-8";

let client = null;
export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
function getClient() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

const workoutSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    weekly_focus: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "string" },
          focus: { type: "string" },
          intensity: { type: "string", enum: ["low", "moderate", "high"] },
          duration_min: { type: "integer" },
          exercises: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                sets: { type: "integer" },
                reps: { type: "string" },
                notes: { type: "string" },
              },
              required: ["name", "sets", "reps", "notes"],
            },
          },
        },
        required: ["day", "focus", "intensity", "duration_min", "exercises"],
      },
    },
    readiness_guidance: { type: "string" },
    cautions: { type: "string" },
  },
  required: ["summary", "weekly_focus", "days", "readiness_guidance", "cautions"],
};

const dietSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    daily_calories: { type: "integer" },
    macros: {
      type: "object",
      additionalProperties: false,
      properties: {
        protein_g: { type: "integer" },
        carbs_g: { type: "integer" },
        fat_g: { type: "integer" },
      },
      required: ["protein_g", "carbs_g", "fat_g"],
    },
    meals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          time: { type: "string" },
          items: { type: "array", items: { type: "string" } },
          calories: { type: "integer" },
          protein_g: { type: "integer" },
        },
        required: ["name", "time", "items", "calories", "protein_g"],
      },
    },
    hydration: { type: "string" },
    notes: { type: "string" },
  },
  required: ["summary", "daily_calories", "macros", "meals", "hydration", "notes"],
};

const recoverySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    recovery_status: { type: "string" },
    estimated_recovery_hours: { type: "integer" },
    sleep_target_hours: { type: "integer" },
    focus_areas: { type: "array", items: { type: "string" } },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, detail: { type: "string" } },
        required: ["title", "detail"],
      },
    },
    hydration_nutrition: { type: "string" },
  },
  required: [
    "summary",
    "recovery_status",
    "estimated_recovery_hours",
    "sleep_target_hours",
    "focus_areas",
    "recommendations",
    "hydration_nutrition",
  ],
};

async function structured(system, user, schema) {
  const resp = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = resp.content.find((b) => b.type === "text")?.text || "{}";
  const data = JSON.parse(text);
  data._engine = "claude";
  return data;
}

export async function aiWorkoutPlan(profile, recovery) {
  const user = `Create this week's workout plan for the following client.\n\n${profileContext(profile, recovery)}`;
  return structured(WORKOUT_SYSTEM, user, workoutSchema);
}

export async function aiDietPlan(profile, recovery) {
  const user = `Create a daily meal plan for the following client.\n\n${profileContext(profile, recovery)}`;
  return structured(DIET_SYSTEM, user, dietSchema);
}

export async function aiRecoveryPlan(profile, recovery) {
  const user = `Create today's recovery plan for the following client.\n\n${profileContext(profile, recovery)}`;
  return structured(RECOVERY_SYSTEM, user, recoverySchema);
}

export async function aiClassifyEdit(message, hasWorkout, hasDiet) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { target: { type: "string", enum: ["workout", "diet", "none"] } },
    required: ["target"],
  };
  return structured(CLASSIFY_SYSTEM, classifyUser(message, hasWorkout, hasDiet), schema);
}

const PLAN_SCHEMAS = { diet: dietSchema, recovery: recoverySchema, workout: workoutSchema };

export async function aiSuggestEdit(kind, plan, suggestion, profile, recovery) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      approved: { type: "boolean" },
      reason: { type: "string" },
      plan: PLAN_SCHEMAS[kind],
    },
    required: ["approved", "reason", "plan"],
  };
  const result = await structured(
    suggestSystem(kind),
    suggestUser(kind, plan, suggestion, profile, recovery),
    schema
  );
  if (result.plan) result.plan._engine = "claude";
  return result;
}

// Streams the coach reply token-by-token into the Express response as plain text.
export async function aiCoachStream(profile, messages, recovery, res) {
  const system = coachSystem(profile, recovery);

  const history = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: history,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      res.write(event.delta.text);
    }
  }
  await stream.finalMessage();
}
