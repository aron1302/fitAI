// Thin client for the backend API.

// ---- CSRF ----
// The server issues a non-httpOnly `fitai_csrf` cookie and requires its value
// echoed in the X-CSRF-Token header on every state-changing request (double
// submit). We read the cookie here and attach it to mutating calls.
function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)fitai_csrf=([a-f0-9]{64})/);
  return m ? m[1] : "";
}
// Headers for a JSON-bodied, state-changing request (Content-Type + CSRF token).
function jsonHeaders(extra = {}) {
  return { "Content-Type": "application/json", "X-CSRF-Token": csrfToken(), ...extra };
}

// ---- Authentication ----

// Return the current user ({ id, email }) or null if not logged in.
/** @returns {Promise<import("./types.js").User | null>} */
export async function fetchMe() {
  try {
    const r = await fetch("/api/auth/me");
    if (!r.ok) return null;
    return (await r.json()).user;
  } catch {
    return null;
  }
}

// POST credentials to /api/auth/<path>. Resolves to the user on success;
// throws an Error with the server's message on failure.
async function postAuth(path, body) {
  const r = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data.user;
}

export const signupRequest = (email, password) => postAuth("signup", { email, password });

// Login returns the full response: { user } on success, or { twoFactorRequired,
// challenge } when a second factor is needed.
export async function loginRequest(email, password) {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Step 2 of login: submit the authenticator (or recovery) code with the challenge.
export async function verifyTwoFactor(challenge, code) {
  const r = await fetch("/api/auth/verify-2fa", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ challenge, code }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Verification failed");
  return data.user;
}

// ---- Two-factor enrollment (authed) ----
export async function start2faSetup() {
  const r = await fetch("/api/auth/2fa/setup", { method: "POST", headers: jsonHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Could not start setup");
  return data; // { secret, otpauthUri, qr }
}
export async function enable2fa(code) {
  const r = await fetch("/api/auth/2fa/enable", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ code }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Could not enable two-factor");
  return data.recoveryCodes;
}
export async function disable2fa(code) {
  const r = await fetch("/api/auth/2fa/disable", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ code }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Could not disable two-factor");
}
export async function regenerateRecoveryCodes(code) {
  const r = await fetch("/api/auth/2fa/recovery-codes", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ code }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Could not regenerate codes");
  return data.recoveryCodes;
}

export async function logoutRequest() {
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: jsonHeaders() });
  } catch {
    // ignore
  }
}

// Revoke all sessions (this device too) — forces re-login everywhere.
export async function logoutAllRequest() {
  await fetch("/api/auth/logout-all", { method: "POST", headers: jsonHeaders() });
}

// Revoke all other devices' sessions, keeping this one.
export async function logoutOthersRequest() {
  const r = await fetch("/api/auth/logout-others", { method: "POST", headers: jsonHeaders() });
  if (!r.ok) throw new Error("Could not sign out other devices");
}

// Active session metadata for the security UI.
export async function fetchSessions() {
  try {
    const r = await fetch("/api/auth/sessions");
    if (!r.ok) return { count: 0, sessions: [] };
    return await r.json();
  } catch {
    return { count: 0, sessions: [] };
  }
}

// ---- Account (GDPR/CCPA) ----

// Download a full JSON export of the user's data.
export async function exportAccount() {
  const r = await fetch("/api/account/export");
  if (!r.ok) throw new Error("Export failed");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fitai-data-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Permanently delete the account and all associated data.
export async function deleteAccountRequest() {
  const r = await fetch("/api/account/delete", { method: "POST", headers: jsonHeaders() });
  if (!r.ok) throw new Error("Account deletion failed");
}

// ---- Email verification & password reset ----

// Confirm an email address from a verification token.
export async function verifyEmailToken(token) {
  const r = await fetch("/api/auth/verify-email", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ token }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Verification failed");
}

// Re-send the verification email to the logged-in user.
export async function resendVerification() {
  const r = await fetch("/api/auth/resend-verification", { method: "POST", headers: jsonHeaders() });
  if (!r.ok) throw new Error("Could not resend the verification email");
}

// Request a password-reset email. Always resolves (no account enumeration).
export async function requestPasswordReset(email) {
  await fetch("/api/auth/request-password-reset", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email }),
  });
}

// Complete a password reset with a token and a new password.
export async function resetPassword(token, password) {
  const r = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ token, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Reset failed");
}

// ---- Persistence: per-user app state ----

// Load all server-stored state ({ profile, dietPlan, ... }). Returns null on
// failure so the caller can fall back to its local cache.
export async function fetchState() {
  try {
    const r = await fetch("/api/state");
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Persist a single state key. Best-effort: errors are swallowed so a flaky
// network never breaks the UI (the local cache still holds the value).
export async function saveState(key, value) {
  try {
    await fetch(`/api/state/${key}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ value }),
    });
  } catch {
    // ignore — cached locally regardless
  }
}

// Resolve an exercise name to a real animated demo via the server (ExerciseDB).
// Returns { gifUrl, info } — gifUrl is null when no key is configured or no match
// is found, and info holds the description/instructions (or null). Always returns
// an object; on error it returns empty so callers fall back to the built-in SVG.
export async function fetchExerciseDemo(name) {
  try {
    // `cache: "no-store"` bypasses the browser HTTP cache. An earlier version of
    // this endpoint returned a cacheable {gifUrl:null}; without this, those stale
    // negative responses would keep being served from cache and hide every GIF.
    const r = await fetch(`/api/exercise-demo?name=${encodeURIComponent(name)}`, {
      cache: "no-store",
    });
    if (!r.ok) return { gifUrl: null, info: null };
    const data = await r.json();
    return { gifUrl: data.gifUrl || null, info: data.info || null };
  } catch {
    return { gifUrl: null, info: null };
  }
}

export async function getStatus() {
  try {
    const r = await fetch("/api/status");
    return await r.json();
  } catch {
    return { ai: false };
  }
}

export async function fetchWorkoutPlan(profile, recovery) {
  const r = await fetch("/api/workout-plan", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ profile, recovery }),
  });
  if (!r.ok) throw new Error("Failed to generate workout plan");
  return r.json();
}

/**
 * @param {import("./types.js").Profile} profile
 * @param {import("./types.js").Recovery} [recovery]
 * @returns {Promise<import("./types.js").DietPlan>}
 */
export async function fetchDietPlan(profile, recovery) {
  const r = await fetch("/api/diet-plan", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ profile, recovery }),
  });
  if (!r.ok) throw new Error("Failed to generate diet plan");
  return r.json();
}

export async function fetchRecoveryPlan(profile, recovery) {
  const r = await fetch("/api/recovery-plan", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ profile, recovery }),
  });
  if (!r.ok) throw new Error("Failed to generate recovery plan");
  return r.json();
}

// Ask the AI to evaluate a freeform edit suggestion for a plan. Returns
// { approved, reason, plan } — plan is the updated plan if approved.
export async function suggestPlanEdit({ kind, plan, suggestion, profile, recovery }) {
  const r = await fetch("/api/suggest-edit", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ kind, plan, suggestion, profile, recovery }),
  });
  if (!r.ok) throw new Error("Suggestion request failed");
  return r.json();
}

// Check whether a coach message is a plan-edit request; if so the AI applies it.
// Returns { action: "chat" } or { action: "update", kind, approved, reason, plan }.
export async function coachAct({ messages, profile, recovery, workoutPlan, dietPlan }) {
  const r = await fetch("/api/coach-act", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ messages, profile, recovery, workoutPlan, dietPlan }),
  });
  if (!r.ok) throw new Error("coach-act failed");
  return r.json();
}

// Streams the coach reply; calls onChunk(text) as tokens arrive.
export async function streamCoach({ profile, messages, recovery }, onChunk) {
  const r = await fetch("/api/coach", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ profile, messages, recovery }),
  });
  if (!r.ok || !r.body) throw new Error("Coach request failed");
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    onChunk(full);
  }
  return full;
}
