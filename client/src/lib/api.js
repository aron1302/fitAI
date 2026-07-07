// Thin client for the backend API.

// Translate low-level fetch failures into a human message. Browsers throw a
// TypeError ("Failed to fetch" / "Load failed" / "NetworkError…") when the
// request never completed — on our free-tier host that usually means the
// server is still waking from its idle sleep.
export function friendlyError(err, fallback = "Request failed") {
  if (err instanceof TypeError) {
    return "Can't reach the server — it may just be waking up. Please try again in ~30 seconds.";
  }
  return err?.message || fallback;
}

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

// Return the current user ({ id, email }) or null if not logged in. Only a 401
// means "not logged in"; a network error or 5xx (e.g. our free-tier host
// mid-cold-start) THROWS so callers don't mistake a temporarily unreachable
// server for a dead session and bounce a still-valid user to the login screen.
/** @returns {Promise<import("./types.js").User | null>} */
export async function fetchMe() {
  const r = await fetch("/api/auth/me");
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`auth check failed (${r.status})`);
  return (await r.json()).user;
}

// Signup returns the full response: { user } when the account was created and a
// session started, or { user: null, message } when the server won't say more
// (e.g. the address may already have an account — check the inbox).
export async function signupRequest(email, password) {
  const r = await fetch("/api/auth/signup", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Login returns the full response: { user } on success, or { twoFactorRequired,
// challenge } when a second factor is needed. Failures carry the server's
// machine-readable `code` (e.g. "unknown_email") so the UI can react to it.
export async function loginRequest(email, password) {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || "Request failed");
    err.code = data.code;
    throw err;
  }
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
  const r = await fetch("/api/auth/resend-verification", {
    method: "POST",
    headers: jsonHeaders(),
  });
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

// "Plan as you go": send a meal the user actually ate (text and/or a small
// base64 photo) for AI nutrition analysis. Resolves with the server's result
// ({ ok, meal, guidance } or { ok:false, reason }); throws on HTTP/network
// failure with a friendly message.
export async function analyzeMealRequest(payload) {
  const r = await fetch("/api/meal-analyze", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error || `Analysis failed (${r.status})`);
  return data;
}

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

// Persist a single state key. Resolves only once the server has confirmed the
// write; rejects on network failure or a non-2xx response so the sync queue
// (lib/sync.js) knows the value is not safely stored yet and keeps retrying.
export async function saveState(key, value) {
  const r = await fetch(`/api/state/${key}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ value }),
  });
  if (!r.ok) throw new Error(`saving ${key} failed (${r.status})`);
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

// ---- Fitness trackers ----

// Connection status for every provider: { providers: { fitbit: {...}, ... } }.
export async function fetchTrackers() {
  try {
    const r = await fetch("/api/trackers");
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Start the Fitbit OAuth flow. Full-page navigation (the server 302s to the
// Fitbit consent screen and bounces back to /profile when done).
export function connectFitbit() {
  window.location.href = "/api/trackers/fitbit/connect";
}

// Pull today's steps/calories from Fitbit into the server. Returns the stored
// activity row, or throws with a friendly message.
export async function syncFitbit(date) {
  const r = await fetch("/api/trackers/fitbit/sync", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ date }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Sync failed");
  return data.activity;
}

export async function disconnectFitbit() {
  const r = await fetch("/api/trackers/fitbit/disconnect", {
    method: "POST",
    headers: jsonHeaders(),
  });
  if (!r.ok) throw new Error("Could not disconnect Fitbit");
}

// Synced activity for a date (YYYY-MM-DD) or null if never synced.
export async function fetchActivity(date) {
  try {
    const r = await fetch(`/api/activity/${date}`);
    if (!r.ok) return null;
    return (await r.json()).activity;
  } catch {
    return null;
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
