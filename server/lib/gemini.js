// Google Gemini integration via the free-tier Generative Language REST API.
// Uses global fetch (Node 18+) so no extra npm dependency is required.

import {
  profileContext,
  WORKOUT_SYSTEM,
  DIET_SYSTEM,
  RECOVERY_SYSTEM,
  WORKOUT_SHAPE,
  DIET_SHAPE,
  RECOVERY_SHAPE,
  coachSystem,
  suggestSystem,
  suggestUser,
  CLASSIFY_SYSTEM,
  classifyUser,
} from "./promptContext.js";

// Default model: 2.5-flash — Google removed 2.0-flash from the free tier
// (free-tier quota is 0 there), so 2.5 is the current no-cost workhorse.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}
export const geminiModel = MODEL;

// One-shot JSON generation (used for workout & diet plans).
async function geminiJSON(systemText, userText) {
  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 8192,
      // 2.5-flash "thinks" before answering, and thinking tokens count against
      // maxOutputTokens — a long think truncates the JSON mid-string (seen as
      // finishReason MAX_TOKENS ≈50% of the time). Structured plan output
      // doesn't benefit from thinking, so turn it off.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const r = await fetch(`${BASE}/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text).join("") || "{}";
  const parsed = JSON.parse(text);
  parsed._engine = "gemini";
  return parsed;
}

export async function geminiWorkoutPlan(profile, recovery) {
  const user = `Create this week's workout plan for the following client.\n\n${profileContext(profile, recovery)}\n\n${WORKOUT_SHAPE}`;
  return geminiJSON(WORKOUT_SYSTEM, user);
}

export async function geminiDietPlan(profile, recovery) {
  const user = `Create a daily meal plan for the following client.\n\n${profileContext(profile, recovery)}\n\n${DIET_SHAPE}`;
  return geminiJSON(DIET_SYSTEM, user);
}

export async function geminiRecoveryPlan(profile, recovery) {
  const user = `Create today's recovery plan for the following client.\n\n${profileContext(profile, recovery)}\n\n${RECOVERY_SHAPE}`;
  return geminiJSON(RECOVERY_SYSTEM, user);
}

export async function geminiClassifyEdit(message, hasWorkout, hasDiet) {
  const result = await geminiJSON(CLASSIFY_SYSTEM, classifyUser(message, hasWorkout, hasDiet));
  return { target: ["workout", "diet"].includes(result.target) ? result.target : "none" };
}

export async function geminiSuggestEdit(kind, plan, suggestion, profile, recovery) {
  const result = await geminiJSON(
    suggestSystem(kind),
    suggestUser(kind, plan, suggestion, profile, recovery)
  );
  if (typeof result.approved !== "boolean" || !result.plan)
    throw new Error("Gemini returned an unexpected suggestion shape");
  result.plan._engine = "gemini";
  return result;
}

// Streams the coach reply as plain text into the Express response.
export async function geminiCoachStream(profile, messages, recovery, res) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body = {
    systemInstruction: { parts: [{ text: coachSystem(profile, recovery) }] },
    contents,
    // Thinking tokens would eat the small reply budget (empty coach replies);
    // chat answers don't need it either.
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.8,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const r = await fetch(
    `${BASE}/${MODEL}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    }
  );
  // Throw before writing anything so the caller can fall back cleanly.
  if (!r.ok || !r.body)
    throw new Error(`Gemini ${r.status}: ${(await r.text?.())?.slice(0, 200) || "stream error"}`);

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const chunk = JSON.parse(json);
        const t = (chunk.candidates?.[0]?.content?.parts || []).map((p) => p.text).join("");
        if (t) res.write(t);
      } catch {
        /* ignore partial/non-JSON keepalive lines */
      }
    }
  }
}
