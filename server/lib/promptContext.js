// Shared prompt context + JSON shape descriptions used by every AI provider
// (Claude and Gemini) so plans stay consistent regardless of backend.

import { nutritionTargets, tdee, readinessBand } from "./targets.js";

export function profileContext(profile, recovery) {
  const t = nutritionTargets(profile);
  // "other" carries the user's own goal description — give the model those
  // exact words so plans are tailored to them, not to a generic bucket.
  const goal =
    profile.goal === "other" && profile.goalCustom?.trim()
      ? `${String(profile.goalCustom).trim().slice(0, 200)} (user-described goal — tailor the plan to it)`
      : profile.goal;
  const lines = [
    `Name: ${profile.name || "unknown"}`,
    `Age: ${profile.age}, Sex: ${profile.sex}`,
    `Height: ${profile.heightCm} cm, Weight: ${profile.weightKg} kg`,
    `Primary goal: ${goal}`,
    `Activity level: ${profile.activityLevel}`,
    `Training days available per week: ${profile.daysPerWeek}`,
    `Experience: ${profile.experience || "intermediate"}`,
    `Impairments / injuries: ${(profile.impairments || []).join(", ") || "none reported"}`,
    `Estimated maintenance calories (TDEE): ${tdee(profile)} kcal`,
    `Computed targets: ${t.calories} kcal, ${t.proteinG}g protein, ${t.carbsG}g carbs, ${t.fatG}g fat`,
  ];
  if (recovery) {
    lines.push(
      `Today's readiness score: ${recovery.readiness}/100 (${readinessBand(recovery.readiness)})`,
      `Recovery inputs: sleep ${recovery.sleepHours}h, resting HR ${recovery.restingHr} bpm, HRV ${recovery.hrv ?? "n/a"} ms, soreness ${recovery.soreness}/5, stress ${recovery.stress}/5, ${recovery.hoursSinceWorkout}h since last workout`
    );
  }
  return lines.join("\n");
}

// Plain-text shape descriptions for providers that take JSON via prompt
// (Gemini) rather than a strict schema object.
export const WORKOUT_SHAPE = `Return ONLY a JSON object with exactly this shape (no markdown, no commentary):
{
  "summary": string,
  "weekly_focus": string,
  "days": [
    {
      "day": string,
      "focus": string,
      "intensity": "low" | "moderate" | "high",
      "duration_min": number,
      "exercises": [ { "name": string, "sets": number, "reps": string, "notes": string } ]
    }
  ],
  "readiness_guidance": string,
  "cautions": string
}`;

export const DIET_SHAPE = `Return ONLY a JSON object with exactly this shape (no markdown, no commentary):
{
  "summary": string,
  "daily_calories": number,
  "macros": { "protein_g": number, "carbs_g": number, "fat_g": number },
  "meals": [ { "name": string, "time": string, "items": [string], "calories": number, "protein_g": number } ],
  "hydration": string,
  "notes": string
}`;

export const WORKOUT_SYSTEM =
  "You are an elite strength & conditioning coach. Design a safe, effective, individualized weekly workout plan. " +
  "Scale total volume and intensity to the athlete's readiness score (lower readiness = lighter/deload). " +
  "Respect every impairment with concrete exercise substitutions in the notes. Use the exact number of training days available. " +
  "Be specific with sets, rep ranges, and short actionable notes per exercise.";

export const RECOVERY_SHAPE = `Return ONLY a JSON object with exactly this shape (no markdown, no commentary):
{
  "summary": string,
  "recovery_status": string,
  "estimated_recovery_hours": number,
  "sleep_target_hours": number,
  "focus_areas": [string],
  "recommendations": [ { "title": string, "detail": string } ],
  "hydration_nutrition": string
}`;

export const RECOVERY_SYSTEM =
  "You are a recovery and sports-science specialist. Design a personalized recovery plan for today based on the client's " +
  "age, weight, readiness score, HRV, resting heart rate, sleep, soreness, and stress. Lower readiness / low HRV / high " +
  "soreness means more rest and gentler active recovery; higher readiness means light mobility is enough. Older or heavier " +
  "clients need more joint care and recovery time. Give concrete, actionable recommendations (mobility, sleep, nutrition, " +
  "stress, when to train hard again). estimated_recovery_hours is how long until the client is ready for an intense session.";

export const DIET_SYSTEM =
  "You are a registered sports dietitian. Build a practical one-day meal plan that hits the client's calorie and macro " +
  "targets for their goal. Use realistic whole foods, include meal times, and keep protein high. Account for their goal, " +
  "age, weight, and recovery needs. Keep per-meal calories and protein roughly consistent with the daily totals.";

// ---- "Plan as you go" meal analysis ----------------------------------------
// The user reports a meal they actually ate (free text and/or a photo); the AI
// estimates its nutrition and advises how to steer the rest of the day.

export const MEAL_ANALYZE_SYSTEM =
  "You are a meticulous sports nutritionist inside a fitness app. The user reports a meal they ACTUALLY ate, as a short " +
  "text description and/or a photo. Identify the foods (from the photo too, if attached) and estimate the meal's " +
  "nutrition using realistic default portion sizes for anything unspecified. Be honest about uncertainty: set " +
  "confidence to low/medium/high and state your key portion assumptions in one short sentence. " +
  "For guidance: compare the day so far (this meal plus anything already eaten) against the user's daily targets and " +
  "give 2-3 specific, actionable sentences on how to proceed with the REST of today — what to prioritise or ease up on " +
  "at the next meals. Be encouraging and non-judgemental; never shame, never give medical advice.";

export const MEAL_ANALYZE_SHAPE = `Return ONLY a JSON object with exactly this shape (no markdown, no commentary):
{
  "meal": {
    "name": string,
    "items": [string],
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number,
    "confidence": "low" | "medium" | "high",
    "assumptions": string
  },
  "guidance": string
}`;

// Builds the user prompt. All inputs are client-supplied, so numbers are
// coerced and strings are length-capped before they reach the model.
export function mealAnalyzeUser(description, profile, targets = {}, eatenToday = []) {
  const n = (v) => Math.max(0, Math.round(Number(v) || 0));
  const t = {
    calories: n(targets.calories),
    proteinG: n(targets.proteinG),
    carbsG: n(targets.carbsG),
    fatG: n(targets.fatG),
  };
  const eaten = (Array.isArray(eatenToday) ? eatenToday : []).slice(0, 15).map((m) => ({
    name: String(m?.name || "meal").slice(0, 80),
    calories: n(m?.calories),
    protein_g: n(m?.protein_g),
  }));
  const soFar = eaten.reduce(
    (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein_g }),
    { calories: 0, protein: 0 }
  );
  return [
    `CLIENT:\n${profileContext(profile)}`,
    t.calories
      ? `DAILY TARGETS: ${t.calories} kcal, ${t.proteinG} g protein, ${t.carbsG} g carbs, ${t.fatG} g fat.`
      : "DAILY TARGETS: not set — base guidance on the computed targets above.",
    eaten.length
      ? `ALREADY EATEN TODAY (~${soFar.calories} kcal, ~${soFar.protein} g protein, before this meal):\n` +
        eaten.map((m) => `- ${m.name} (~${m.calories} kcal, ${m.protein_g} g protein)`).join("\n")
      : "Nothing else has been logged today yet.",
    description
      ? `THE MEAL TO ANALYSE (user's own words):\n"""${description}"""`
      : "THE MEAL TO ANALYSE: no text given — identify it from the attached photo.",
  ].join("\n\n");
}

// For the "suggest a change" feature: the AI judges whether a user's requested
// edit is suitable and either applies it or declines with a reason.
const KIND_ROLE = {
  diet: "sports dietitian reviewing a change to a client's meal plan",
  recovery: "recovery specialist reviewing a change to a client's recovery plan",
  workout: "strength coach reviewing a change to a client's workout plan",
};

export function suggestSystem(kind) {
  return (
    `You are a supportive ${KIND_ROLE[kind] || KIND_ROLE.diet}. ` +
    "DEFAULT TO HONORING the client's request — they know their own preferences. APPLY the change and return the FULL " +
    "updated plan in the same JSON shape whenever it is reasonable. Common requests like switching training splits " +
    "(bro split, push/pull/legs, upper/lower, full-body), changing exercises, or making meals vegetarian/dairy-free/" +
    "higher-protein are all valid — approve and apply them. " +
    "ONLY decline (approved:false, plan unchanged) if the change is genuinely unsafe — e.g. it would aggravate a stated " +
    "injury/impairment, is medically risky, or is extreme/disordered. Suboptimal-but-safe is NOT a reason to decline. " +
    'Give a concise "reason" (1-3 sentences) addressed to the client.'
  );
}

const KIND_SHAPE = { diet: DIET_SHAPE, recovery: RECOVERY_SHAPE, workout: WORKOUT_SHAPE };

// `context` (optional) is a short transcript of the recent conversation. When
// the request is a bare confirmation ("yes, do it"), the coach's proposal in
// that transcript is what should be applied.
export function suggestUser(kind, plan, suggestion, profile, recovery, context = "") {
  return (
    `${profileContext(profile, recovery)}\n\n` +
    `CURRENT ${kind.toUpperCase()} PLAN (JSON):\n${JSON.stringify(plan)}\n\n` +
    (context
      ? `RECENT CONVERSATION (for context — if the request below is a short confirmation like "yes" or "do it", ` +
        `apply the specific change the coach just proposed here):\n${context}\n\n`
      : "") +
    `THE CLIENT REQUESTS THIS CHANGE:\n"${suggestion}"\n\n` +
    `Return ONLY a JSON object: { "approved": boolean, "reason": string, "plan": <PLAN> }\n` +
    `Rules: if approved is true, the "plan" you return MUST already include the requested change (edit the relevant ` +
    `items/fields). If approved is false, return the plan UNCHANGED. Never set approved true without actually applying the change.\n` +
    `<PLAN> is the full plan in this shape:\n${KIND_SHAPE[kind]}`
  );
}

// Classify whether a coach message is a request to edit an existing plan.
export const CLASSIFY_SYSTEM =
  "You are an intent classifier for a fitness app's AI coach. Decide if the user's LATEST message is a request to CHANGE " +
  "or EDIT one of their existing plans. Examples that ARE edits: 'change my push/pull/legs split to a bro split', " +
  "'swap leg day for arms', 'make my meals vegetarian', 'add more protein to my diet', 'remove dairy from my meal plan'. " +
  "IMPORTANT: use the conversation so far for context. If the coach just proposed a specific plan/split and the user " +
  "replies with a confirmation or an apply request — 'yes', 'do it', 'change it on the app', 'apply that', 'make that my " +
  "plan' — that IS an edit; pick the plan type (workout/diet) the coach was just discussing. " +
  "General questions, advice, or anything that is not a request to apply a change is 'none'. " +
  "Only pick 'workout' or 'diet' if that plan currently exists.";

// `recentContext` is a short transcript of the last few turns (see recentTurns);
// it lets a bare confirmation like "yes, do it" resolve against what the coach
// just proposed.
export function classifyUser(message, hasWorkout, hasDiet, recentContext = "") {
  return (
    `workout_plan_exists: ${hasWorkout}\ndiet_plan_exists: ${hasDiet}\n\n` +
    (recentContext ? `Conversation so far:\n${recentContext}\n\n` : "") +
    `User's latest message: "${message}"\n\n` +
    `Return ONLY JSON: {"target":"workout"|"diet"|"none"}`
  );
}

// A compact transcript of the last `n` messages for prompt context, capped so a
// long chat can't blow the token budget.
export function recentTurns(messages, n = 6) {
  return (messages || [])
    .slice(-n)
    .map((m) => `${m.role === "assistant" ? "Coach" : "Client"}: ${String(m.content).slice(0, 800)}`)
    .join("\n");
}

export function coachSystem(profile, recovery) {
  return (
    "You are FitAI Coach, a knowledgeable, encouraging personal trainer and nutrition coach. " +
    "Give specific, practical, evidence-based advice grounded in the client's profile and numbers below. " +
    "Be concise and conversational. Never give unsafe medical advice; suggest seeing a professional for medical concerns.\n\n" +
    "CLIENT PROFILE:\n" +
    profileContext(profile, recovery)
  );
}
