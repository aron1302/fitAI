import { describe, it, expect, beforeAll } from "vitest";

// Point the DB at an in-memory SQLite instance *before* importing the module
// (imports are hoisted, so this must be a dynamic import).
let m;
let rawDb;
beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  m = await import("../server/lib/db.js");
  rawDb = m.default;
});

describe("isStateKey", () => {
  it("accepts known keys and rejects unknown ones", () => {
    expect(m.isStateKey("dietPlan")).toBe(true);
    expect(m.isStateKey("profile")).toBe(true);
    expect(m.isStateKey("__proto__")).toBe(false);
    expect(m.isStateKey("hacker")).toBe(false);
  });
});

describe("users", () => {
  it("creates and looks up a user", () => {
    const user = m.createUser("a@b.com", "hash123");
    expect(user.email).toBe("a@b.com");
    const found = m.getUserByEmail("a@b.com");
    expect(found.password_hash).toBe("hash123");
    expect(m.getUserById(user.id).email).toBe("a@b.com");
  });

  it("enforces unique emails", () => {
    m.createUser("dup@b.com", "h");
    expect(() => m.createUser("dup@b.com", "h")).toThrow();
  });
});

describe("app state", () => {
  it("round-trips values per user", () => {
    const u = m.createUser("state@b.com", "h");
    m.setState(u.id, "dietPlan", { daily_calories: 2000 });
    m.setState(u.id, "profile", { name: "Sam" });
    const state = m.getState(u.id);
    expect(state.dietPlan).toEqual({ daily_calories: 2000 });
    expect(state.profile).toEqual({ name: "Sam" });
  });

  it("upserts (overwrites) an existing key", () => {
    const u = m.createUser("upsert@b.com", "h");
    m.setState(u.id, "profile", { v: 1 });
    m.setState(u.id, "profile", { v: 2 });
    expect(m.getState(u.id).profile).toEqual({ v: 2 });
  });

  it("isolates state between users", () => {
    const a = m.createUser("iso-a@b.com", "h");
    const b = m.createUser("iso-b@b.com", "h");
    m.setState(a.id, "dietPlan", { owner: "a" });
    expect(m.getState(b.id)).toEqual({});
  });

  it("rejects an unknown state key", () => {
    const u = m.createUser("badkey@b.com", "h");
    expect(() => m.setState(u.id, "evil", 1)).toThrow(/unknown state key/);
  });

  it("setManyState writes known keys and skips unknown ones", () => {
    const u = m.createUser("many@b.com", "h");
    m.setManyState(u.id, { profile: { x: 1 }, evil: "nope", recovery: { y: 2 } });
    const state = m.getState(u.id);
    expect(state.profile).toEqual({ x: 1 });
    expect(state.recovery).toEqual({ y: 2 });
    expect(state.evil).toBeUndefined();
  });
});

describe("sessions", () => {
  it("creates a session and resolves it to the user", () => {
    const u = m.createUser("sess@b.com", "h");
    const token = m.createSession(u.id);
    expect(typeof token).toBe("string");
    expect(m.getSessionUserId(token)).toBe(u.id);
  });

  it("returns null for missing or destroyed tokens", () => {
    expect(m.getSessionUserId("nope")).toBe(null);
    expect(m.getSessionUserId(undefined)).toBe(null);
    const u = m.createUser("logout@b.com", "h");
    const token = m.createSession(u.id);
    m.destroySession(token);
    expect(m.getSessionUserId(token)).toBe(null);
  });

  it("treats an expired session as invalid and deletes it", () => {
    const u = m.createUser("expired@b.com", "h");
    const token = "expiredtoken123";
    rawDb
      .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
      .run(token, u.id, Math.floor(Date.now() / 1000) - 10);
    expect(m.getSessionUserId(token)).toBe(null);
    // it should have been purged
    expect(rawDb.prepare("SELECT 1 FROM sessions WHERE token = ?").get(token)).toBeUndefined();
  });
});
