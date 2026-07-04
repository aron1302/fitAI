// Session-cookie authentication, hardened. Passwords are hashed with bcryptjs;
// a random opaque session token is stored server-side and handed to the browser
// as an httpOnly cookie. Adds: password-strength rules, failed-login lockout,
// no user enumeration, audit logging (with hashed IPs), and session revocation.

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import QRCode from "qrcode";
import {
  createUser,
  getUserByEmail,
  getUserById,
  createSession,
  getSessionUserId,
  destroySession,
  destroyAllSessions,
  destroyOtherSessions,
  listSessions,
  deleteUser,
  exportUser,
  logAudit,
  loginLockedUntil,
  registerFailedLogin,
  clearLoginAttempts,
  setEmailVerified,
  updatePasswordHash,
  createEmailToken,
  deleteUserTokens,
  consumeEmailToken,
  getTotp,
  setTotpSecret,
  enableTotp,
  disableTotp,
  replaceRecoveryCodes,
  consumeRecoveryCode,
  SESSION_TTL_SECONDS,
} from "./db.js";
import { config, hashIp } from "./config.js";
import { validatePassword } from "./password.js";
import { newToken, hashToken, VERIFY_TTL_MS, RESET_TTL_MS } from "./tokens.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAccountExistsEmail,
} from "./email.js";
import { generateSecret, verifyTotp, otpauthUri } from "./totp.js";
import { signChallenge, verifyChallenge } from "./challenge.js";

// Shape returned to the client for a user.
const userPayload = (u) => ({
  id: u.id,
  email: u.email,
  emailVerified: !!u.email_verified,
  twoFactorEnabled: !!u.totp_enabled,
});

// ---- Recovery codes ----
const RECOVERY_COUNT = 10;
const normalizeRecovery = (code) => String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const hashRecovery = (code) => crypto.createHash("sha256").update(normalizeRecovery(code)).digest("hex");
function generateRecoveryCodes() {
  return Array.from({ length: RECOVERY_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

// Create a verification token, store its hash, and email the link. Best-effort:
// failures are logged but never block the surrounding request.
async function issueVerification(userId, email) {
  try {
    const raw = newToken();
    deleteUserTokens(userId, "verify");
    createEmailToken(userId, "verify", hashToken(raw), Date.now() + VERIFY_TTL_MS);
    await sendVerificationEmail(email, `${config.appUrl}/verify-email?token=${raw}`);
  } catch (err) {
    console.error("[auth] verification email failed:", err.message);
  }
}

export const SESSION_COOKIE = "fitai_session";

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: config.isProd,
  maxAge: SESSION_TTL_SECONDS * 1000,
  path: "/",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Failed-login lockout is scoped to email + client IP (emails can't contain
// whitespace, so "\n" is a safe separator). Keying on the email alone would let
// anyone who knows a victim's address lock them out on purpose; the per-IP auth
// rate limiter still bounds distributed guessing across many addresses.
const lockoutKey = (emailKey, ipHash) => `${emailKey}\n${ipHash || ""}`;

// Hashed client IP for audit/session metadata (never the raw address).
function reqIpHash(req) {
  return hashIp(req.ip || req.socket?.remoteAddress || "");
}
function reqUserAgent(req) {
  return (req.get("user-agent") || "").slice(0, 200);
}

// Resolve the logged-in user id from the request's session cookie (or null).
export function sessionToken(req) {
  return req.cookies?.[SESSION_COOKIE];
}
export function userIdFromRequest(req) {
  return getSessionUserId(sessionToken(req));
}

// Express middleware: 401 unless a valid session is present. Attaches req.userId.
export function requireAuth(req, res, next) {
  const userId = userIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "not authenticated" });
  req.userId = userId;
  next();
}

function startSession(req, res, userId) {
  const token = createSession(userId, { ipHash: reqIpHash(req), userAgent: reqUserAgent(req) });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export async function signup(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "a valid email is required" });
  }
  const strength = validatePassword(password, email);
  if (!strength.ok) return res.status(400).json({ error: strength.error });
  const existing = getUserByEmail(email.toLowerCase());
  if (existing) {
    // Don't reveal that the address is registered. Respond with the same
    // generic "check your email" as a pending signup and notify the account
    // owner instead (they can log in or reset their password).
    logAudit({ event: "signup_existing_email", userId: existing.id, ipHash: reqIpHash(req) });
    try {
      await sendAccountExistsEmail(existing.email, `${config.appUrl}/`);
    } catch (err) {
      console.error("[auth] account-exists email failed:", err.message);
    }
    return res.json({
      user: null,
      message: "Check your email to finish setting up your account.",
    });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = createUser(email.toLowerCase(), passwordHash);
  startSession(req, res, user.id);
  logAudit({ event: "signup", userId: user.id, ipHash: reqIpHash(req) });
  await issueVerification(user.id, user.email);
  res.json({ user: { id: user.id, email: user.email, emailVerified: false } });
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }
  const key = email.toLowerCase();
  const ipHash = reqIpHash(req);
  const lkey = lockoutKey(key, ipHash);

  // Lockout check first, so a locked account can't be probed further.
  const until = loginLockedUntil(lkey);
  if (until) {
    logAudit({ event: "login_locked", ipHash, detail: hashIp(key) });
    const mins = Math.ceil((until - Date.now()) / 60000);
    return res
      .status(429)
      .json({ error: `too many attempts — try again in about ${mins} minute${mins === 1 ? "" : "s"}` });
  }

  const user = getUserByEmail(key);
  // Always run a compare to avoid leaking whether the email exists (timing).
  const ok = user
    ? await bcrypt.compare(password, user.password_hash)
    : await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv");

  if (!user || !ok) {
    const lockedUntil = registerFailedLogin(lkey, config.maxLoginAttempts, config.lockoutMs);
    logAudit({
      event: lockedUntil ? "login_lockout_triggered" : "login_fail",
      userId: user?.id ?? null,
      ipHash,
      // Keyed hash of the attempted email (same HMAC as IPs) so repeat attempts
      // stay correlatable in the audit trail without storing the address itself.
      detail: hashIp(key),
    });
    return res.status(401).json({ error: "invalid email or password" });
  }

  // Password is correct. If 2FA is on, don't start a session yet — return a
  // short-lived challenge and require the authenticator code (second factor).
  if (user.totp_enabled) {
    logAudit({ event: "login_2fa_challenge", userId: user.id, ipHash });
    return res.json({ twoFactorRequired: true, challenge: signChallenge(user.id) });
  }

  clearLoginAttempts(lkey);
  startSession(req, res, user.id);
  logAudit({ event: "login_success", userId: user.id, ipHash });
  res.json({ user: userPayload(user) });
}

// ---- Two-factor (TOTP) ----

// Step 2 of login: verify the authenticator (or recovery) code against the
// challenge from step 1, then create the real session.
export function verifyTwoFactor(req, res) {
  const { challenge, code } = req.body || {};
  const userId = verifyChallenge(challenge);
  if (!userId) {
    return res.status(401).json({ error: "your login attempt expired — please sign in again" });
  }
  const user = getUserById(userId);
  if (!user || !user.totp_enabled) {
    return res.status(401).json({ error: "two-factor is not active for this account" });
  }
  const key = user.email.toLowerCase();
  const ipHash = reqIpHash(req);
  const lkey = lockoutKey(key, ipHash);

  const until = loginLockedUntil(lkey);
  if (until) {
    const mins = Math.ceil((until - Date.now()) / 60000);
    return res.status(429).json({ error: `too many attempts — try again in about ${mins} minute${mins === 1 ? "" : "s"}` });
  }

  const { totp_secret } = getTotp(userId);
  const submitted = String(code || "").trim();
  let ok = /^\d{6}$/.test(submitted) && verifyTotp(totp_secret, submitted);
  if (!ok) ok = consumeRecoveryCode(userId, hashRecovery(submitted)); // recovery-code fallback

  if (!ok) {
    registerFailedLogin(lkey, config.maxLoginAttempts, config.lockoutMs);
    logAudit({ event: "login_2fa_fail", userId, ipHash });
    return res.status(401).json({ error: "invalid authentication code" });
  }

  clearLoginAttempts(lkey);
  startSession(req, res, userId);
  logAudit({ event: "login_success", userId, ipHash, detail: "2fa" });
  res.json({ user: userPayload(user) });
}

// Begin enrollment: generate a pending secret and return the QR + secret so the
// user can add it to their authenticator app. Not enabled until confirmed.
export async function startTotpSetup(req, res) {
  const user = getUserById(req.userId);
  if (user.totp_enabled) return res.status(400).json({ error: "two-factor is already enabled" });
  const secret = generateSecret();
  setTotpSecret(req.userId, secret);
  const uri = otpauthUri(secret, user.email);
  const qr = await QRCode.toDataURL(uri);
  res.json({ secret, otpauthUri: uri, qr });
}

// Confirm enrollment with a code; on success enable 2FA and return one-time
// recovery codes (shown to the user once).
export function enableTwoFactor(req, res) {
  const user = getUserById(req.userId);
  if (user.totp_enabled) return res.status(400).json({ error: "two-factor is already enabled" });
  const { totp_secret } = getTotp(req.userId);
  if (!totp_secret) return res.status(400).json({ error: "start two-factor setup first" });
  if (!verifyTotp(totp_secret, String(req.body?.code || "").trim())) {
    return res.status(400).json({ error: "that code didn't match — check your authenticator and try again" });
  }
  enableTotp(req.userId);
  const codes = generateRecoveryCodes();
  replaceRecoveryCodes(req.userId, codes.map(hashRecovery));
  logAudit({ event: "twofa_enabled", userId: req.userId, ipHash: reqIpHash(req) });
  res.json({ ok: true, recoveryCodes: codes });
}

// Disable 2FA — requires a current authenticator or recovery code.
export function disableTwoFactor(req, res) {
  const user = getUserById(req.userId);
  if (!user.totp_enabled) return res.json({ ok: true });
  const { totp_secret } = getTotp(req.userId);
  const code = String(req.body?.code || "").trim();
  let ok = /^\d{6}$/.test(code) && verifyTotp(totp_secret, code);
  if (!ok) ok = consumeRecoveryCode(req.userId, hashRecovery(code));
  if (!ok) {
    return res.status(400).json({ error: "enter a valid authentication or recovery code to disable 2FA" });
  }
  disableTotp(req.userId);
  logAudit({ event: "twofa_disabled", userId: req.userId, ipHash: reqIpHash(req) });
  res.json({ ok: true });
}

// Regenerate recovery codes (invalidates the old set) — requires a current code.
export function regenerateRecoveryCodes(req, res) {
  const user = getUserById(req.userId);
  if (!user.totp_enabled) return res.status(400).json({ error: "two-factor isn't enabled" });
  const { totp_secret } = getTotp(req.userId);
  if (!verifyTotp(totp_secret, String(req.body?.code || "").trim())) {
    return res.status(400).json({ error: "enter a current authentication code to regenerate codes" });
  }
  const codes = generateRecoveryCodes();
  replaceRecoveryCodes(req.userId, codes.map(hashRecovery));
  logAudit({ event: "twofa_recovery_regenerated", userId: req.userId, ipHash: reqIpHash(req) });
  res.json({ recoveryCodes: codes });
}

export function logout(req, res) {
  const token = sessionToken(req);
  const userId = userIdFromRequest(req);
  destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  if (userId) logAudit({ event: "logout", userId, ipHash: reqIpHash(req) });
  res.json({ ok: true });
}

// Revoke every session for the user (this device included) — forces re-login
// everywhere after, e.g., a suspected compromise.
export function logoutAll(req, res) {
  destroyAllSessions(req.userId);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  logAudit({ event: "logout_all", userId: req.userId, ipHash: reqIpHash(req) });
  res.json({ ok: true });
}

// Revoke all OTHER sessions but keep the current one.
export function logoutOthers(req, res) {
  destroyOtherSessions(req.userId, sessionToken(req));
  logAudit({ event: "logout_others", userId: req.userId, ipHash: reqIpHash(req) });
  res.json({ ok: true });
}

// List the user's active sessions (metadata only) for the security UI.
export function sessions(req, res) {
  const rows = listSessions(req.userId).map((s) => ({
    created_at: s.created_at,
    expires_at: s.expires_at,
    user_agent: s.user_agent,
    current: false,
  }));
  res.json({ count: rows.length, sessions: rows });
}

export function me(req, res) {
  const userId = userIdFromRequest(req);
  if (!userId) return res.json({ user: null });
  const user = getUserById(userId);
  res.json({ user: user ? userPayload(user) : null });
}

// ---- Email verification ----

// Public: confirm an email from the link's token.
export function verifyEmail(req, res) {
  const raw = String(req.query.token || req.body?.token || "");
  if (!raw) return res.status(400).json({ error: "missing token" });
  const userId = consumeEmailToken(hashToken(raw), "verify");
  if (!userId) return res.status(400).json({ error: "this verification link is invalid or expired" });
  setEmailVerified(userId);
  logAudit({ event: "email_verified", userId, ipHash: reqIpHash(req) });
  res.json({ ok: true });
}

// Authed: re-send the verification email.
export async function resendVerification(req, res) {
  const user = getUserById(req.userId);
  if (!user) return res.status(401).json({ error: "not authenticated" });
  if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });
  await issueVerification(user.id, user.email);
  logAudit({ event: "verification_resent", userId: user.id, ipHash: reqIpHash(req) });
  res.json({ ok: true });
}

// ---- Password reset ----

// Public: request a reset link. Always responds 200 to avoid revealing whether
// an account exists.
export async function requestPasswordReset(req, res) {
  const email = String(req.body?.email || "").toLowerCase();
  if (EMAIL_RE.test(email)) {
    const user = getUserByEmail(email);
    if (user) {
      try {
        const raw = newToken();
        deleteUserTokens(user.id, "reset");
        createEmailToken(user.id, "reset", hashToken(raw), Date.now() + RESET_TTL_MS);
        await sendPasswordResetEmail(user.email, `${config.appUrl}/reset-password?token=${raw}`);
        logAudit({ event: "password_reset_requested", userId: user.id, ipHash: reqIpHash(req) });
      } catch (err) {
        console.error("[auth] reset email failed:", err.message);
      }
    }
  }
  res.json({ ok: true });
}

// Public: complete a reset with the token + a new password. Revokes all sessions
// so any attacker session is invalidated.
export async function resetPassword(req, res) {
  const { token, password } = req.body || {};
  const strength = validatePassword(password);
  if (!strength.ok) return res.status(400).json({ error: strength.error });
  const userId = consumeEmailToken(hashToken(String(token || "")), "reset");
  if (!userId) return res.status(400).json({ error: "this reset link is invalid or expired" });

  const passwordHash = await bcrypt.hash(password, 12);
  updatePasswordHash(userId, passwordHash);
  // Completing a reset proves email control, so mark verified too.
  setEmailVerified(userId);
  destroyAllSessions(userId);
  const user = getUserById(userId);
  if (user?.email) clearLoginAttempts(user.email.toLowerCase());
  logAudit({ event: "password_reset", userId, ipHash: reqIpHash(req) });
  res.json({ ok: true });
}

// GDPR/CCPA data export — everything we hold for this user, as a download.
export function exportAccount(req, res) {
  const data = exportUser(req.userId);
  logAudit({ event: "account_export", userId: req.userId, ipHash: reqIpHash(req) });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", 'attachment; filename="fitai-data-export.json"');
  res.send(JSON.stringify(data, null, 2));
}

// GDPR/CCPA right to erasure — permanently delete the account and all data.
export function deleteAccount(req, res) {
  const user = getUserById(req.userId);
  if (user?.email) clearLoginAttempts(user.email.toLowerCase());
  deleteUser(req.userId); // app_state + sessions cascade
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  // Audit the deletion by user id only (the email row is now gone).
  logAudit({ event: "account_delete", userId: req.userId, ipHash: reqIpHash(req) });
  res.json({ ok: true });
}
