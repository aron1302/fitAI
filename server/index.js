import "dotenv/config";
import dns from "node:dns";
import express from "express";

// Prefer IPv4 for outbound connections. Some hosts (e.g. Render) advertise
// IPv6 routes that silently drop traffic to external APIs; Node's fetch then
// burns ~10s per address before failing (seen as every Gemini call "failing"
// after ~20s and falling back to the rule-based engine).
dns.setDefaultResultOrder("ipv4first");
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config, assertConfig } from "./lib/config.js";
import { csrfIssue, csrfProtect } from "./lib/csrf.js";
import {
  getState,
  setState,
  setManyState,
  isStateKey,
  purgeExpiredSessions,
  closeDatabase,
  listTrackerAccounts,
  getDailyActivity,
  logAudit,
} from "./lib/db.js";
import {
  signup,
  login,
  logout,
  logoutAll,
  logoutOthers,
  sessions,
  me,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  verifyTwoFactor,
  startTotpSetup,
  enableTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
  exportAccount,
  deleteAccount,
  requireAuth,
} from "./lib/auth.js";
import {
  aiEnabled,
  aiWorkoutPlan,
  aiDietPlan,
  aiRecoveryPlan,
  aiSuggestEdit,
  aiClassifyEdit,
  aiCoachStream,
} from "./lib/ai.js";
import {
  geminiEnabled,
  geminiModel,
  geminiWorkoutPlan,
  geminiDietPlan,
  geminiRecoveryPlan,
  geminiSuggestEdit,
  geminiClassifyEdit,
  geminiCoachStream,
} from "./lib/gemini.js";
import {
  ollamaEnabled,
  ollamaUp,
  ollamaModel,
  ollamaWorkoutPlan,
  ollamaDietPlan,
  ollamaRecoveryPlan,
  ollamaSuggestEdit,
  ollamaClassifyEdit,
  ollamaCoachStream,
} from "./lib/ollama.js";
import {
  generateWorkoutPlan,
  generateDietPlan,
  generateRecoveryPlan,
  coachReply as ruleCoach,
} from "./lib/fallback.js";
import { exerciseDbEnabled, exerciseInfo, exerciseImage } from "./lib/exercisedb.js";
import {
  fitbitEnabled,
  beginAuth as fitbitBeginAuth,
  completeAuth as fitbitCompleteAuth,
  syncDay as fitbitSyncDay,
  disconnect as fitbitDisconnect,
  OAUTH_COOKIE as FITBIT_OAUTH_COOKIE,
  PROVIDER as FITBIT,
} from "./lib/fitbit.js";
import {
  ProfileSchema,
  RecoverySchema,
  MessagesSchema,
  PlanKindSchema,
  PLAN_SCHEMAS,
  SuggestEditResultSchema,
} from "./lib/schemas.js";
import { recentTurns } from "./lib/promptContext.js";

// Validate `value` against a Zod `schema`. Returns { ok:true, data } on success
// or { ok:false, error } with a human-readable message listing the bad fields.
function check(schema, value) {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  const error = r.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error };
}

// Pick the active AI provider. Cloud keys win if configured; otherwise local
// Ollama if it's installed & running; otherwise the rule-based engine.
async function provider() {
  if (geminiEnabled()) return "gemini";
  if (aiEnabled()) return "claude";
  if (ollamaEnabled() && (await ollamaUp())) return "ollama";
  return "rules";
}
const planners = {
  gemini: {
    workout: geminiWorkoutPlan,
    diet: geminiDietPlan,
    recovery: geminiRecoveryPlan,
    suggest: geminiSuggestEdit,
    classify: geminiClassifyEdit,
    coach: geminiCoachStream,
  },
  claude: {
    workout: aiWorkoutPlan,
    diet: aiDietPlan,
    recovery: aiRecoveryPlan,
    suggest: aiSuggestEdit,
    classify: aiClassifyEdit,
    coach: aiCoachStream,
  },
  ollama: {
    workout: ollamaWorkoutPlan,
    diet: ollamaDietPlan,
    recovery: ollamaRecoveryPlan,
    suggest: ollamaSuggestEdit,
    classify: ollamaClassifyEdit,
    coach: ollamaCoachStream,
  },
};
function providerLabel(p) {
  return p === "gemini"
    ? geminiModel
    : p === "claude"
      ? "claude-opus-4-8"
      : p === "ollama"
        ? ollamaModel
        : "rule-based";
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Validate secrets/config before doing anything else (fatal in production).
assertConfig();

const app = express();
const PORT = config.port;

// Trust the upstream proxy (when TLS is terminated there) so req.ip and
// secure-cookie detection use the real client connection.
app.set("trust proxy", config.trustProxy);

// Security headers. The SPA uses inline style attributes (React style props), so
// style-src allows 'unsafe-inline'; everything else is locked to same-origin.
const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "font-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
};
if (config.isProd) cspDirectives["upgrade-insecure-requests"] = [];

app.use(
  helmet({
    contentSecurityPolicy: { useDefaults: false, directives: cspDirectives },
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    crossOriginEmbedderPolicy: false,
  })
);

// Same-origin only by default; ALLOWED_ORIGINS opens specific cross-origin SPAs.
app.use(
  cors({
    origin: config.allowedOrigins.length ? config.allowedOrigins : false,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
// Issue a CSRF token cookie on every response, and reject state-changing API
// requests whose header token doesn't match the cookie.
app.use(csrfIssue);
app.use("/api", csrfProtect);

// Clear out expired sessions on boot.
purgeExpiredSessions();

// Liveness probe for the platform health check / load balancer / uptime monitor.
// Deliberately cheap — no DB or AI-provider calls — so it never flaps under load.
// `commit` (from Render's RENDER_GIT_COMMIT) tells us which build is running.
app.get("/healthz", (req, res) =>
  res.json({
    status: "ok",
    uptime: process.uptime(),
    commit: (process.env.RENDER_GIT_COMMIT || "").slice(0, 7) || undefined,
  })
);

// Stricter limiter for the auth endpoints (on top of per-account lockout).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please try again later." },
});

// Throttle the AI-backed endpoints so a runaway client (or abuse) can't rack up
// provider cost or pin the server. Generous enough for normal interactive use.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again in a minute." },
});

// ---- Authentication ----
app.post("/api/auth/signup", authLimiter, signup);
app.post("/api/auth/login", authLimiter, login);
app.post("/api/auth/logout", logout);
app.post("/api/auth/logout-all", requireAuth, logoutAll);
app.post("/api/auth/logout-others", requireAuth, logoutOthers);
app.get("/api/auth/sessions", requireAuth, sessions);
app.get("/api/auth/me", me);

// ---- Email verification & password reset ----
app.post("/api/auth/verify-email", verifyEmail);
app.post("/api/auth/resend-verification", authLimiter, requireAuth, resendVerification);
app.post("/api/auth/request-password-reset", authLimiter, requestPasswordReset);
app.post("/api/auth/reset-password", authLimiter, resetPassword);

// ---- Two-factor (TOTP) ----
app.post("/api/auth/verify-2fa", authLimiter, verifyTwoFactor);
app.post("/api/auth/2fa/setup", requireAuth, startTotpSetup);
app.post("/api/auth/2fa/enable", requireAuth, enableTwoFactor);
app.post("/api/auth/2fa/disable", requireAuth, disableTwoFactor);
app.post("/api/auth/2fa/recovery-codes", requireAuth, regenerateRecoveryCodes);

// ---- Account: data export & deletion (GDPR/CCPA) ----
app.get("/api/account/export", requireAuth, exportAccount);
app.post("/api/account/delete", requireAuth, deleteAccount);

// ---- Exercise demo GIFs ----
// Resolve an exercise name to a real animated demo (ExerciseDB). The GIF itself
// sits behind the API key, so we return a same-origin proxy URL the browser can
// load directly. Returns { gifUrl: string | null }; client falls back to the
// built-in SVG when null.
app.get("/api/exercise-demo", requireAuth, async (req, res) => {
  const name = String(req.query.name || "").slice(0, 100);
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!exerciseDbEnabled()) return res.json({ gifUrl: null, info: null, enabled: false });
  const info = await exerciseInfo(name);
  // Don't let the browser cache the JSON lookup — a negative result cached here
  // (e.g. before a key was configured) would keep hiding the GIF. The server's
  // own in-memory cache already makes repeat lookups cheap, and the actual image
  // bytes are cached hard by the /image route below.
  res.set("Cache-Control", "no-store");
  res.json({
    gifUrl: info ? `/api/exercise-demo/image/${info.id}` : null,
    info: info
      ? {
          name: info.name,
          target: info.target,
          bodyPart: info.bodyPart,
          equipment: info.equipment,
          secondaryMuscles: info.secondaryMuscles,
          instructions: info.instructions,
        }
      : null,
    enabled: true,
  });
});

// Stream the animated GIF bytes for an exercise id, fetched server-side with the
// API key. Heavily cached since the asset never changes. The id is restricted to
// a safe charset so it can't smuggle path segments into the upstream fetch.
app.get("/api/exercise-demo/image/:id", requireAuth, async (req, res) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(req.params.id)) return res.status(404).end();
  const img = await exerciseImage(req.params.id);
  if (!img) return res.status(404).end();
  res.set("Content-Type", img.contentType);
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.send(img.buffer);
});

// ---- Fitness trackers (steps / calories / active minutes) ----
// Fitbit is fully implemented (free public OAuth API). Garmin needs approval
// into their developer program; Apple Health has no web API at all (native iOS
// only) — both are reported to the UI so it can explain their status honestly.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Connection status for every provider, so the UI can render the devices panel.
app.get("/api/trackers", requireAuth, (req, res) => {
  const connected = new Map(listTrackerAccounts(req.userId).map((t) => [t.provider, t]));
  res.json({
    providers: {
      fitbit: {
        available: fitbitEnabled(),
        connected: connected.has(FITBIT),
        connectedAt: connected.get(FITBIT)?.connected_at ?? null,
        note: fitbitEnabled()
          ? null
          : "Server is missing FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET.",
      },
      garmin: {
        available: false,
        connected: false,
        note: "Requires approval into the Garmin Connect Developer Program.",
      },
      apple_health: {
        available: false,
        connected: false,
        note: "Apple Health has no web API — it needs a native iOS app to read it.",
      },
    },
  });
});

// Start the Fitbit OAuth flow. This is a top-level browser navigation (not a
// fetch), so it 302s to Fitbit's consent screen with the signed state cookie.
app.get("/api/trackers/fitbit/connect", requireAuth, (req, res) => {
  if (!fitbitEnabled()) return res.status(503).send("Fitbit is not configured on this server.");
  const { url, cookieValue, cookieMaxAge } = fitbitBeginAuth(req.userId);
  res.cookie(FITBIT_OAUTH_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: cookieMaxAge,
    path: "/api/trackers/fitbit",
  });
  res.redirect(url);
});

// OAuth callback from Fitbit. On success, bounce back into the app's profile
// page; on failure, bounce back with an error the UI can show.
app.get("/api/trackers/fitbit/callback", async (req, res) => {
  res.clearCookie(FITBIT_OAUTH_COOKIE, { path: "/api/trackers/fitbit" });
  try {
    const userId = await fitbitCompleteAuth({
      cookie: req.cookies?.[FITBIT_OAUTH_COOKIE],
      state: String(req.query.state || ""),
      code: String(req.query.code || ""),
    });
    logAudit({ event: "tracker_connected", userId, detail: FITBIT });
    res.redirect("/profile?tracker=connected");
  } catch (err) {
    console.error("[fitbit] connect failed:", err.message);
    res.redirect("/profile?tracker=error");
  }
});

// Pull the activity summary for one day (the client sends its local date) and
// store it. Returns the stored row.
app.post("/api/trackers/fitbit/sync", requireAuth, async (req, res) => {
  const date = String(req.body?.date || "");
  if (!DATE_RE.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  try {
    const row = await fitbitSyncDay(req.userId, date);
    if (!row) return res.status(400).json({ error: "Fitbit is not connected" });
    res.json({ activity: row });
  } catch (err) {
    console.error("[fitbit] sync failed:", err.message);
    res.status(502).json({ error: "Couldn't reach Fitbit — please try again." });
  }
});

// Disconnect Fitbit (revokes the token upstream, deletes our copy).
app.post("/api/trackers/fitbit/disconnect", requireAuth, async (req, res) => {
  await fitbitDisconnect(req.userId);
  logAudit({ event: "tracker_disconnected", userId: req.userId, detail: FITBIT });
  res.json({ ok: true });
});

// Synced activity for one day (defaults to nothing if never synced) — the
// dashboard uses this to replace the simulated numbers with real ones.
app.get("/api/activity/:date", requireAuth, (req, res) => {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  res.json({ activity: getDailyActivity(req.userId, req.params.date) || null });
});

// ---- Persistence: per-user app state (profile, plans, logs, history) ----
// All state routes require a valid session; requireAuth sets req.userId.

// Return all stored state for the current user as one object.
app.get("/api/state", requireAuth, (req, res) => {
  res.json(getState(req.userId));
});

// Bulk upsert: body is an object of { key: value } pairs.
app.put("/api/state", requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "body must be an object of state entries" });
  }
  setManyState(req.userId, body);
  res.json({ ok: true });
});

// Upsert a single state key.
app.put("/api/state/:key", requireAuth, (req, res) => {
  const { key } = req.params;
  if (!isStateKey(key)) return res.status(400).json({ error: `unknown state key: ${key}` });
  if (!("value" in (req.body || {})))
    return res.status(400).json({ error: "body must include a 'value' field" });
  setState(req.userId, key, req.body.value);
  res.json({ ok: true });
});

// Report which AI provider is available so the UI can show a badge.
app.get("/api/status", async (req, res) => {
  const p = await provider();
  res.json({ ai: p !== "rules", provider: p, model: providerLabel(p) });
});

// Validate the { profile, recovery } body shared by the three plan endpoints.
// Returns the parsed values, or sends a 400 and returns null.
function planInput(req, res) {
  const prof = check(ProfileSchema, req.body?.profile);
  if (!prof.ok) {
    res.status(400).json({ error: `invalid profile — ${prof.error}` });
    return null;
  }
  const rec = check(RecoverySchema, req.body?.recovery);
  if (!rec.ok) {
    res.status(400).json({ error: `invalid recovery — ${rec.error}` });
    return null;
  }
  return { profile: prof.data, recovery: rec.data };
}

app.post("/api/workout-plan", requireAuth, aiLimiter, async (req, res) => {
  const input = planInput(req, res);
  if (!input) return;
  const { profile, recovery } = input;
  const p = await provider();
  try {
    // Validate the model's output so a malformed plan can't crash the UI; an
    // invalid shape throws here and falls through to the rule-based engine.
    if (p !== "rules")
      return res.json(PLAN_SCHEMAS.workout.parse(await planners[p].workout(profile, recovery)));
  } catch (err) {
    console.error(`${p} workout plan failed/invalid, using fallback:`, err.message);
  }
  res.json(generateWorkoutPlan(profile, recovery));
});

app.post("/api/diet-plan", requireAuth, aiLimiter, async (req, res) => {
  const input = planInput(req, res);
  if (!input) return;
  const { profile, recovery } = input;
  const p = await provider();
  try {
    if (p !== "rules")
      return res.json(PLAN_SCHEMAS.diet.parse(await planners[p].diet(profile, recovery)));
  } catch (err) {
    console.error(`${p} diet plan failed/invalid, using fallback:`, err.message);
  }
  res.json(generateDietPlan(profile));
});

app.post("/api/recovery-plan", requireAuth, aiLimiter, async (req, res) => {
  const input = planInput(req, res);
  if (!input) return;
  const { profile, recovery } = input;
  const p = await provider();
  try {
    if (p !== "rules")
      return res.json(PLAN_SCHEMAS.recovery.parse(await planners[p].recovery(profile, recovery)));
  } catch (err) {
    console.error(`${p} recovery plan failed/invalid, using fallback:`, err.message);
  }
  res.json(generateRecoveryPlan(profile, recovery));
});

// AI-judged plan edit: the model decides if the requested change is suitable
// and either applies it (approved + updated plan) or declines with a reason.
app.post("/api/suggest-edit", requireAuth, aiLimiter, async (req, res) => {
  const { kind, plan, suggestion, profile, recovery } = req.body || {};
  const kindCheck = check(PlanKindSchema, kind);
  if (!kindCheck.ok)
    return res.status(400).json({ error: "kind must be one of diet|recovery|workout" });
  if (!plan || typeof plan !== "object")
    return res.status(400).json({ error: "plan (object) is required" });
  if (typeof suggestion !== "string" || !suggestion.trim())
    return res.status(400).json({ error: "suggestion (string) is required" });
  const prof = check(ProfileSchema, profile);
  if (!prof.ok) return res.status(400).json({ error: `invalid profile — ${prof.error}` });

  const p = await provider();
  if (p === "rules") {
    return res.json({
      approved: false,
      reason:
        "AI-assisted suggestions need an AI engine. Enable local AI (Ollama) or add an API key to use this feature.",
      plan,
    });
  }
  try {
    // Validate the AI's response shape, and if it approved an edited plan,
    // validate that plan too — never hand a malformed plan back to the UI.
    const result = SuggestEditResultSchema.parse(
      await planners[p].suggest(kind, plan, suggestion, prof.data, recovery)
    );
    if (result.approved && result.plan) PLAN_SCHEMAS[kind].parse(result.plan);
    return res.json(result);
  } catch (err) {
    console.error(`${p} suggest-edit failed/invalid:`, err.message);
    return res.json({
      approved: false,
      reason: "Sorry, I couldn't process that suggestion — please try rephrasing it.",
      plan,
    });
  }
});

// Coach action check: decides if the latest message is a request to edit the
// workout or diet plan. If so, applies the AI edit and returns the result;
// otherwise tells the client to fall back to normal streaming chat.
app.post("/api/coach-act", requireAuth, aiLimiter, async (req, res) => {
  const { workoutPlan, dietPlan } = req.body || {};
  const prof = check(ProfileSchema, req.body?.profile);
  if (!prof.ok) return res.status(400).json({ error: `invalid profile — ${prof.error}` });
  const msgs = check(MessagesSchema, req.body?.messages);
  if (!msgs.ok) return res.status(400).json({ error: `invalid messages — ${msgs.error}` });
  const profile = prof.data;
  const messages = msgs.data;
  const recovery = req.body?.recovery;
  const p = await provider();
  if (p === "rules") return res.json({ action: "chat" });

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  // The recent transcript lets a bare confirmation ("yes, do it") resolve
  // against the plan the coach just proposed, instead of being seen in isolation.
  const context = recentTurns(messages);
  try {
    const { target } = await planners[p].classify(
      lastUser,
      Boolean(workoutPlan),
      Boolean(dietPlan),
      context
    );
    const plan = target === "workout" ? workoutPlan : target === "diet" ? dietPlan : null;
    if (plan) {
      const result = await planners[p].suggest(target, plan, lastUser, profile, recovery, context);
      return res.json({ action: "update", kind: target, ...result });
    }
  } catch (err) {
    console.error(`${p} coach-act failed, defaulting to chat:`, err.message);
  }
  res.json({ action: "chat" });
});

// Coach: streams plain text. Falls back to a rule-based reply on error/no key.
app.post("/api/coach", requireAuth, aiLimiter, async (req, res) => {
  const prof = check(ProfileSchema, req.body?.profile);
  if (!prof.ok) return res.status(400).json({ error: `invalid profile — ${prof.error}` });
  const msgs = check(MessagesSchema, req.body?.messages);
  if (!msgs.ok) return res.status(400).json({ error: `invalid messages — ${msgs.error}` });
  const profile = prof.data;
  const messages = msgs.data;
  const recovery = req.body?.recovery;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  const p = await provider();
  if (p !== "rules") {
    try {
      await planners[p].coach(profile, messages, recovery, res);
      return res.end();
    } catch (err) {
      console.error(`${p} coach failed, using fallback:`, err.message);
      // fall through to rule-based if nothing was streamed yet
    }
  }
  res.write(ruleCoach(profile, messages));
  res.end();
});

// Serve the built frontend in production.
const distDir = path.join(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  // RFC 9116 security.txt. Served explicitly because express.static ignores
  // dotfile paths (/.well-known/) by default, and the SPA catch-all below would
  // otherwise return index.html for it.
  app.get("/.well-known/security.txt", (req, res) => {
    res.type("text/plain; charset=utf-8");
    res.sendFile(path.join(distDir, ".well-known", "security.txt"));
  });
  // Android Digital Asset Links: proves to Android that the TWA-packaged app
  // (PWABuilder APK) owns this origin, so it runs full-screen without the
  // browser bar. Must exactly match the APK's package name + signing cert.
  app.get("/.well-known/assetlinks.json", (req, res) => {
    res.type("application/json");
    res.sendFile(path.join(distDir, ".well-known", "assetlinks.json"));
  });
  app.use(express.static(distDir));
  app.get("*", (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

const server = app.listen(PORT, async () => {
  const p = await provider();
  console.log(`\n  FitAI server running on http://localhost:${PORT}`);
  console.log(
    `  AI provider: ${p === "rules" ? "rule-based fallback (no API key / Ollama not running)" : `${p} (${providerLabel(p)})`}\n`
  );
});

// Graceful shutdown: stop accepting connections, close the DB (checkpointing the
// WAL), then exit. Containers/orchestrators send SIGTERM on deploy/stop; honour
// it so in-flight requests drain and the database is left clean.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ${signal} received — shutting down gracefully…`);
  server.close(() => {
    closeDatabase();
    console.log("  HTTP server closed, database checkpointed. Bye.");
    process.exit(0);
  });
  // Don't hang forever if connections won't drain.
  setTimeout(() => {
    console.error("  Shutdown timed out — forcing exit.");
    process.exit(1);
  }, 10000).unref();
}
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => shutdown(sig));
