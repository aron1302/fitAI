// CSRF protection via the double-submit-cookie pattern.
//
// On every response we ensure a random token exists in a NON-httpOnly cookie
// (`fitai_csrf`). Browser JS can read it and echo it back in the `X-CSRF-Token`
// header on state-changing requests. A forged cross-site request can send the
// cookie automatically but cannot read it to set the matching header, so the
// check fails. Safe (read-only) methods are exempt.

import crypto from "node:crypto";
import { config } from "./config.js";

export const CSRF_COOKIE = "fitai_csrf";
const HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function cookieOpts() {
  return {
    httpOnly: false, // must be readable by the SPA to echo back
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  };
}

// Ensure the request/response carries a CSRF token cookie. Returns the token.
export function ensureCsrfCookie(req, res) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, token, cookieOpts());
  }
  return token;
}

// Middleware: issue the cookie on every request so the SPA always has a token.
export function csrfIssue(req, res, next) {
  ensureCsrfCookie(req, res);
  next();
}

// Constant-time compare of two hex strings of equal length.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// Middleware: enforce that the header token matches the cookie token on every
// state-changing request. Apply after cookieParser and csrfIssue.
export function csrfProtect(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(HEADER);
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({ error: "invalid or missing CSRF token" });
  }
  next();
}

// Exposed for tests.
export const _safeEqual = safeEqual;
