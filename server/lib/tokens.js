// One-time tokens for email verification and password reset.
//
// The raw token is emailed to the user; only its SHA-256 hash is stored in the
// database. So even a database leak can't be used to verify emails or reset
// passwords — an attacker would still need the original token from the email.

import crypto from "node:crypto";

// A high-entropy URL-safe token (hex).
export function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Stable hash used as the DB lookup key for a raw token.
export function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

// Token lifetimes.
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
