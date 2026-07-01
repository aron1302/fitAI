// RFC 6238 TOTP (time-based one-time password) — implemented directly on Node's
// crypto so the security-critical logic is auditable and unit-testable against
// the RFC's published test vectors. SHA-1, 6 digits, 30-second period (the
// defaults every authenticator app expects).

import crypto from "node:crypto";

const DIGITS = 6;
const PERIOD = 30;
const ALGO = "sha1";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// ---- base32 (RFC 4648, no padding) ----
function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// A fresh base32 secret (160 bits — the RFC-recommended size for SHA-1).
export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// HOTP for an explicit counter.
function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac(ALGO, key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

// The current TOTP token (or for an explicit unix time, used by tests).
export function totpToken(secretBase32, forTimeSeconds = Math.floor(Date.now() / 1000)) {
  return hotp(secretBase32, Math.floor(forTimeSeconds / PERIOD));
}

// Verify a submitted token against the secret, allowing ±`window` steps of clock
// drift (default 1 = accept the previous, current, and next 30s window).
export function verifyTotp(secretBase32, token, window = 1) {
  const clean = String(token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  for (let w = -window; w <= window; w++) {
    if (crypto.timingSafeEqual(Buffer.from(hotp(secretBase32, counter + w)), Buffer.from(clean))) {
      return true;
    }
  }
  return false;
}

// The otpauth:// URI an authenticator app scans.
export function otpauthUri(secretBase32, email, issuer = "FitAI") {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
