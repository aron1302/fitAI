// A short-lived, signed token that proves a user passed the password step and is
// mid-2FA. Stateless (HMAC-signed with the session secret) so it needs no server
// storage. Format: base64url(payload).base64url(hmac)

import crypto from "node:crypto";
import { config } from "./config.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes to enter the code

function sign(payload) {
  return crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function signChallenge(userId, ttlMs = DEFAULT_TTL_MS) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + ttlMs })).toString(
    "base64url"
  );
  return `${payload}.${sign(payload)}`;
}

// Returns the user id if the token is valid and unexpired, else null.
export function verifyChallenge(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = sign(payload);
  if (
    !sig ||
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.uid || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}
