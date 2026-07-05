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

// Each Gemini model has its OWN free-tier daily quota bucket, and those buckets
// are small (observed ~20-250 requests/day per model on this key). So instead of
// relying on one model, every request walks a CHAIN of interchangeable models:
// when one returns 429 (quota/rate) or errors, the same request retries on the
// next — multiplying effective free capacity by the number of models before the
// caller ever falls back to the rule-based engine. Ordered high-quota /
// low-latency first (flash-lite class), then more capable, then older buckets as
// extra headroom. Override with GEMINI_MODELS (comma-separated) or GEMINI_MODEL.
const DEFAULT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
];
const MODELS = (
  process.env.GEMINI_MODELS
    ? process.env.GEMINI_MODELS.split(",").map((s) => s.trim()).filter(Boolean)
    : process.env.GEMINI_MODEL
      ? [process.env.GEMINI_MODEL]
      : DEFAULT_MODELS
).filter((v, i, a) => a.indexOf(v) === i);
// Label for the /api/status badge: the first model in the chain.
export const geminiModel = MODELS[0];
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// One-shot JSON generation (used for workout & diet plans). Walks the model
// chain: a quota/availability failure on one model retries on the next.
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
  let lastErr;
  for (const model of MODELS) {
    try {
      const r = await fetch(`${BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) {
        lastErr = new Error(`Gemini ${model} ${r.status}: ${(await r.text()).slice(0, 200)}`);
        continue;
      }
      const data = await r.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text).join("") || "{}";
      const parsed = JSON.parse(text);
      parsed._engine = "gemini";
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
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

export async function geminiClassifyEdit(message, hasWorkout, hasDiet, context = "") {
  const result = await geminiJSON(CLASSIFY_SYSTEM, classifyUser(message, hasWorkout, hasDiet, context));
  return { target: ["workout", "diet"].includes(result.target) ? result.target : "none" };
}

export async function geminiSuggestEdit(kind, plan, suggestion, profile, recovery, context = "") {
  const result = await geminiJSON(
    suggestSystem(kind),
    suggestUser(kind, plan, suggestion, profile, recovery, context)
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
  // Walk the model chain; throw before writing anything so the caller can
  // fall back cleanly if every model is unavailable.
  let r = null;
  let lastErr;
  for (const model of MODELS) {
    try {
      const attempt = await fetch(
        `${BASE}/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90000),
        }
      );
      if (attempt.ok && attempt.body) {
        r = attempt;
        break;
      }
      lastErr = new Error(
        `Gemini ${model} ${attempt.status}: ${(await attempt.text?.())?.slice(0, 200) || "stream error"}`
      );
    } catch (err) {
      lastErr = err;
    }
  }
  if (!r) throw lastErr || new Error("Gemini stream unavailable");

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
