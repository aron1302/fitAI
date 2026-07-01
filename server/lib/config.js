// Centralised configuration and secrets validation.
//
// Every secret/env read goes through here so we can (a) fail fast in production
// when something critical is missing or left at an insecure default, and (b)
// keep a single source of truth for environment-derived flags.

import crypto from "node:crypto";

const isProd = process.env.NODE_ENV === "production";

// Collected problems; in production any of these aborts startup.
const problems = [];

// SESSION_SECRET is used to HMAC client IPs before they touch the audit log
// (so we never store raw IPs) and to sign other server-side values. It must be
// strong and stable in production. In dev we fall back to a random ephemeral
// secret (sessions/audit hashes won't survive a restart, which is fine locally).
let sessionSecret = process.env.SESSION_SECRET || "";
if (!sessionSecret) {
  if (isProd) {
    problems.push("SESSION_SECRET is required in production (set a long random value).");
  } else {
    sessionSecret = crypto.randomBytes(32).toString("hex");
  }
} else if (sessionSecret.length < 32) {
  problems.push("SESSION_SECRET must be at least 32 characters.");
}

// Comma-separated list of browser origins allowed to call the API with
// credentials. Empty means "same-origin only" (the production default, since the
// SPA is served from the same origin as the API).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Behind a TLS-terminating reverse proxy (nginx/Caddy/cloud LB), Express must
// trust the proxy so req.ip and secure-cookie detection use the real client.
// Set TRUST_PROXY=1 (or a hop count / subnet) when deployed behind one.
const trustProxyRaw = process.env.TRUST_PROXY;
const trustProxy = trustProxyRaw
  ? /^\d+$/.test(trustProxyRaw)
    ? Number(trustProxyRaw)
    : trustProxyRaw === "true"
      ? 1
      : trustProxyRaw
  : false;

if (isProd && !trustProxy) {
  // Not fatal, but secure cookies won't be set correctly if TLS is terminated
  // upstream and the proxy isn't trusted.
  console.warn(
    "  [config] NODE_ENV=production but TRUST_PROXY is unset — set it if TLS is terminated by a proxy, or secure cookies may not apply."
  );
}

const port = Number(process.env.PORT) || 3001;

// Public base URL used to build links in emails (verification / reset). Must be
// the externally-reachable origin in production.
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, "");
if (isProd && !process.env.APP_URL) {
  console.warn("  [config] APP_URL is unset — email links will point at localhost. Set it in production.");
}

// Email transport: SMTP if configured, otherwise a console transport that prints
// messages (incl. links) to the server log so flows are testable locally.
const smtp = {
  url: process.env.SMTP_URL || "",
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: process.env.MAIL_FROM || "FitAI <no-reply@fitai.local>",
};
const emailEnabled = Boolean(smtp.url || smtp.host);
if (isProd && !emailEnabled) {
  console.warn(
    "  [config] No SMTP configured — verification/reset emails will only print to the log. Configure SMTP_* for production."
  );
}

export const config = {
  isProd,
  port,
  appUrl,
  sessionSecret,
  allowedOrigins,
  trustProxy,
  smtp,
  emailEnabled,
  // Lockout policy for repeated failed logins.
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS) || 8,
  lockoutMs: Number(process.env.LOCKOUT_MINUTES || 15) * 60 * 1000,
};

// Call once at startup. Aborts the process in production if any secret is
// missing/weak; in development it only warns so local runs stay frictionless.
export function assertConfig() {
  if (problems.length === 0) return;
  const msg = problems.map((p) => `  - ${p}`).join("\n");
  if (isProd) {
    console.error(`\n[config] Refusing to start — fix these before deploying:\n${msg}\n`);
    process.exit(1);
  } else {
    console.warn(`\n[config] Development warnings (would be fatal in production):\n${msg}\n`);
  }
}

// Deterministic, non-reversible hash of an IP for the audit log, keyed by the
// session secret so the same IP maps to the same opaque value without ever
// storing the raw address (PII minimisation).
export function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHmac("sha256", sessionSecret).update(String(ip)).digest("hex").slice(0, 32);
}
