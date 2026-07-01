import { describe, it, expect } from "vitest";
import { validatePassword, COMMON_PASSWORDS } from "../server/lib/password.js";
import { _safeEqual, CSRF_COOKIE } from "../server/lib/csrf.js";
import { hashIp } from "../server/lib/config.js";
import { newToken, hashToken } from "../server/lib/tokens.js";
import { totpToken, verifyTotp, generateSecret } from "../server/lib/totp.js";
import { signChallenge, verifyChallenge } from "../server/lib/challenge.js";

describe("password policy", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("Ab1!").ok).toBe(false);
    expect(validatePassword("Abc123!").ok).toBe(false);
  });

  it("rejects common passwords", () => {
    for (const p of ["password123", "qwerty123", "letmein"]) {
      expect(validatePassword(p).ok).toBe(false);
    }
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(10);
  });

  it("rejects a password that contains the email name", () => {
    expect(validatePassword("johnsmith99", "johnsmith@example.com").ok).toBe(false);
  });

  it("requires 3 character classes when under 12 chars", () => {
    expect(validatePassword("lowercase").ok).toBe(false); // 9 chars, 1 class
    expect(validatePassword("loweronly1").ok).toBe(false); // 10 chars, 2 classes
    expect(validatePassword("Str0ng!pass").ok).toBe(true); // 11 chars, 4 classes
  });

  it("accepts a long passphrase even with few classes", () => {
    expect(validatePassword("correcthorsebatterystaple").ok).toBe(true);
  });

  it("rejects excessively long input", () => {
    expect(validatePassword("a".repeat(201) + "B1!").ok).toBe(false);
  });
});

describe("CSRF token comparison", () => {
  it("exposes a stable cookie name", () => {
    expect(CSRF_COOKIE).toBe("fitai_csrf");
  });

  it("matches identical tokens and rejects mismatches/lengths", () => {
    const a = "a".repeat(64);
    expect(_safeEqual(a, a)).toBe(true);
    expect(_safeEqual(a, "b".repeat(64))).toBe(false);
    expect(_safeEqual(a, "a".repeat(63))).toBe(false);
    expect(_safeEqual(a, undefined)).toBe(false);
    expect(_safeEqual(undefined, undefined)).toBe(false);
  });
});

describe("IP hashing (PII minimisation)", () => {
  it("is deterministic and non-reversible-looking", () => {
    const h1 = hashIp("203.0.113.5");
    const h2 = hashIp("203.0.113.5");
    expect(h1).toBe(h2);
    expect(h1).not.toContain("203.0.113.5");
    expect(h1).toMatch(/^[a-f0-9]{32}$/);
  });

  it("maps different IPs to different hashes", () => {
    expect(hashIp("203.0.113.5")).not.toBe(hashIp("203.0.113.6"));
  });

  it("returns null for an empty IP", () => {
    expect(hashIp("")).toBe(null);
  });
});

describe("email/reset tokens", () => {
  it("generates unique high-entropy tokens", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically and not as the raw token (stored hash != token)", () => {
    const raw = newToken();
    const h = hashToken(raw);
    expect(hashToken(raw)).toBe(h);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toBe(raw);
  });
});

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC's published SHA-1 test vectors", () => {
    const s = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32("12345678901234567890")
    expect(totpToken(s, 59)).toBe("287082");
    expect(totpToken(s, 1111111109)).toBe("081804");
    expect(totpToken(s, 1234567890)).toBe("005924");
    expect(totpToken(s, 2000000000)).toBe("279037");
  });

  it("verifies the current token and rejects wrong/malformed input", () => {
    const s = generateSecret();
    const now = Math.floor(Date.now() / 1000);
    const real = totpToken(s, now);
    expect(verifyTotp(s, real)).toBe(true);
    const wrong = real === "000000" ? "111111" : "000000";
    expect(verifyTotp(s, wrong)).toBe(false);
    expect(verifyTotp(s, "abc")).toBe(false);
  });
});

describe("2FA login challenge", () => {
  it("round-trips a signed challenge", () => {
    expect(verifyChallenge(signChallenge(42))).toBe(42);
  });
  it("rejects tampered or malformed tokens", () => {
    expect(verifyChallenge(signChallenge(42) + "x")).toBe(null);
    expect(verifyChallenge("garbage")).toBe(null);
    expect(verifyChallenge("")).toBe(null);
  });
  it("rejects an expired challenge", () => {
    expect(verifyChallenge(signChallenge(7, -1000))).toBe(null);
  });
});
