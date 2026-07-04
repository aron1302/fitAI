import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "../server/lib/cryptobox.js";

// DB must point at :memory: before the module loads (same pattern as db.test.js).
let m;
beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  m = await import("../server/lib/db.js");
});

describe("cryptobox (tracker token encryption)", () => {
  it("round-trips a value", () => {
    const boxed = encrypt("fitbit-access-token-123");
    expect(boxed).not.toContain("fitbit");
    expect(decrypt(boxed)).toBe("fitbit-access-token-123");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("returns null for tampered or garbage input", () => {
    const boxed = encrypt("secret");
    expect(decrypt(boxed.slice(0, -2) + "zz")).toBe(null);
    expect(decrypt("not-a-box")).toBe(null);
    expect(decrypt("")).toBe(null);
  });
});

describe("tracker accounts", () => {
  it("stores, lists, and removes a connection", () => {
    const u = m.createUser("tracker@b.com", "h");
    m.saveTrackerAccount({
      userId: u.id,
      provider: "fitbit",
      accessTokenEnc: encrypt("at"),
      refreshTokenEnc: encrypt("rt"),
      expiresAt: 123,
      externalId: "FB123",
      scope: "activity",
    });
    const acct = m.getTrackerAccount(u.id, "fitbit");
    expect(decrypt(acct.access_token_enc)).toBe("at");
    expect(acct.external_id).toBe("FB123");
    expect(m.listTrackerAccounts(u.id).map((t) => t.provider)).toEqual(["fitbit"]);
    m.removeTrackerAccount(u.id, "fitbit");
    expect(m.getTrackerAccount(u.id, "fitbit")).toBeUndefined();
  });

  it("upserts on reconnect and updates tokens on refresh", () => {
    const u = m.createUser("tracker2@b.com", "h");
    const base = {
      userId: u.id,
      provider: "fitbit",
      accessTokenEnc: encrypt("old"),
      refreshTokenEnc: null,
      expiresAt: 1,
      externalId: null,
      scope: "activity",
    };
    m.saveTrackerAccount(base);
    m.saveTrackerAccount({ ...base, accessTokenEnc: encrypt("new"), expiresAt: 2 });
    expect(decrypt(m.getTrackerAccount(u.id, "fitbit").access_token_enc)).toBe("new");
    m.saveTrackerTokens(u.id, "fitbit", encrypt("refreshed"), encrypt("rt2"), 99);
    const acct = m.getTrackerAccount(u.id, "fitbit");
    expect(decrypt(acct.access_token_enc)).toBe("refreshed");
    expect(acct.expires_at).toBe(99);
  });
});

describe("daily activity", () => {
  it("upserts one row per user per day and reads it back", () => {
    const u = m.createUser("activity@b.com", "h");
    m.saveDailyActivity({
      userId: u.id,
      date: "2026-07-04",
      steps: 8000,
      caloriesOut: 2300,
      activeMinutes: 45,
      provider: "fitbit",
    });
    m.saveDailyActivity({
      userId: u.id,
      date: "2026-07-04",
      steps: 9500, // later sync the same day overwrites
      caloriesOut: 2500,
      activeMinutes: 52,
      provider: "fitbit",
    });
    const row = m.getDailyActivity(u.id, "2026-07-04");
    expect(row.steps).toBe(9500);
    expect(row.calories_out).toBe(2500);
    expect(m.getRecentActivity(u.id)).toHaveLength(1);
  });

  it("is isolated per user", () => {
    const a = m.createUser("act-a@b.com", "h");
    const b = m.createUser("act-b@b.com", "h");
    m.saveDailyActivity({
      userId: a.id,
      date: "2026-07-04",
      steps: 1,
      caloriesOut: 1,
      activeMinutes: 1,
      provider: "fitbit",
    });
    expect(m.getDailyActivity(b.id, "2026-07-04")).toBeUndefined();
  });
});
