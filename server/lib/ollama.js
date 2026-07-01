// Local Ollama integration — free, offline, no API key. Talks to the Ollama
// server (default http://localhost:11434). Uses global fetch; no npm dependency.

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

const MODEL = process.env.OLLAMA_MODEL || "llama3.2";
// Use 127.0.0.1 (not "localhost") — Node's fetch resolves localhost to IPv6
// ::1 first, but Ollama listens on IPv4, causing false "not running" results.
const HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

export const ollamaModel = MODEL;

// Opt-in: enabled unless explicitly turned off. Selected only if the local
// server is actually reachable (see ollamaUp).
export function ollamaEnabled() {
  return process.env.USE_OLLAMA !== "false";
}

// Quick health check so we only route to Ollama when it's really running.
export async function ollamaUp() {
  try {
    const r = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ollamaJSON(system, user) {
  const r = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0.7 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const parsed = JSON.parse(data.message?.content || "{}");
  parsed._engine = "ollama";
  return parsed;
}

export async function ollamaWorkoutPlan(profile, recovery) {
  const user = `Create this week's workout plan for the following client.\n\n${profileContext(profile, recovery)}\n\n${WORKOUT_SHAPE}`;
  const plan = await ollamaJSON(WORKOUT_SYSTEM, user);
  // Validate shape; a small local model can drift — fall back if so.
  if (
    !Array.isArray(plan.days) ||
    plan.days.length === 0 ||
    !plan.days.every((d) => Array.isArray(d.exercises))
  ) {
    throw new Error("Ollama returned an unexpected workout shape");
  }
  return plan;
}

export async function ollamaDietPlan(profile, recovery) {
  const user = `Create a daily meal plan for the following client.\n\n${profileContext(profile, recovery)}\n\n${DIET_SHAPE}`;
  const plan = await ollamaJSON(DIET_SYSTEM, user);
  if (!Array.isArray(plan.meals) || plan.meals.length === 0 || !plan.macros) {
    throw new Error("Ollama returned an unexpected diet shape");
  }
  return plan;
}

export async function ollamaRecoveryPlan(profile, recovery) {
  const user = `Create today's recovery plan for the following client.\n\n${profileContext(profile, recovery)}\n\n${RECOVERY_SHAPE}`;
  const plan = await ollamaJSON(RECOVERY_SYSTEM, user);
  if (
    !Array.isArray(plan.recommendations) ||
    plan.recommendations.length === 0 ||
    !Array.isArray(plan.focus_areas)
  ) {
    throw new Error("Ollama returned an unexpected recovery shape");
  }
  return plan;
}

export async function ollamaClassifyEdit(message, hasWorkout, hasDiet) {
  const result = await ollamaJSON(CLASSIFY_SYSTEM, classifyUser(message, hasWorkout, hasDiet));
  return { target: ["workout", "diet"].includes(result.target) ? result.target : "none" };
}

export async function ollamaSuggestEdit(kind, plan, suggestion, profile, recovery) {
  const result = await ollamaJSON(
    suggestSystem(kind),
    suggestUser(kind, plan, suggestion, profile, recovery)
  );
  if (typeof result.approved !== "boolean" || !result.plan || typeof result.reason !== "string") {
    throw new Error("Ollama returned an unexpected suggestion shape");
  }
  result.plan._engine = "ollama";
  return result;
}

export async function ollamaCoachStream(profile, messages, recovery, res) {
  const body = {
    model: MODEL,
    stream: true,
    options: { temperature: 0.8, num_predict: 700 },
    messages: [
      { role: "system", content: coachSystem(profile, recovery) },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ],
  };
  const r = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) throw new Error(`Ollama ${r.status}: stream error`);

  // Ollama streams newline-delimited JSON: {message:{content}, done}.
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
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        const t = obj.message?.content || "";
        if (t) res.write(t);
      } catch {
        /* ignore non-JSON keepalive */
      }
    }
  }
}
