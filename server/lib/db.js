// SQLite persistence. A single file-backed database holds users, a per-user
// key/value store for app state, sessions, an audit log, and failed-login
// tracking. Schema is applied through a small versioned migration runner so the
// database can evolve safely in production.

import Database from "libsql";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "..", "fitai.db");

// Storage modes:
//  - Local file (default): a plain on-disk SQLite database. Used in dev and for
//    any host with a persistent disk. Identical behaviour to before.
//  - Turso embedded replica: when TURSO_DATABASE_URL is set, DB_PATH becomes a
//    fast LOCAL replica that reads locally and writes through to the Turso cloud
//    primary (durable immediately, read-your-writes). This lets the app run on a
//    host with an EPHEMERAL disk (e.g. a free tier) without losing data: on each
//    cold start the local replica is rebuilt from the cloud primary by sync().
//    SQLite's one-writer rule still holds — run a single instance.
const SYNC_URL = process.env.TURSO_DATABASE_URL;
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const useReplica = Boolean(SYNC_URL);

const db = useReplica
  ? new Database(DB_PATH, { syncUrl: SYNC_URL, authToken: AUTH_TOKEN })
  : new Database(DB_PATH);

// Pull the latest state from the cloud primary BEFORE running migrations, so the
// synced schema_migrations table is current. Without this, the non-idempotent
// ALTER TABLE migrations could re-run against an already-migrated primary. A
// failure here is fatal on purpose — better to stop than risk corrupting schema.
if (useReplica) {
  await db.sync();
}

// WAL is a local-file concept and isn't applicable to an embedded replica, so it
// is best-effort. Foreign keys drive the account-delete cascade — keep them on.
try {
  if (!useReplica) db.pragma("journal_mode = WAL");
} catch {
  // ignore — replica manages its own storage
}
try {
  db.pragma("foreign_keys = ON");
} catch {
  // ignore
}

// ---- Migrations ------------------------------------------------------------
// Each migration runs once, in order, inside a transaction, and is recorded in
// schema_migrations. Statements are written to be safe on an existing database
// (the app previously created the core tables directly, so 001 uses IF NOT
// EXISTS and later migrations only add new objects).
const MIGRATIONS = [
  {
    name: "001_core",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT UNIQUE,
        password_hash TEXT,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS app_state (
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (user_id, key)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        expires_at INTEGER NOT NULL
      );`,
  },
  {
    name: "002_audit_log",
    sql: `
      CREATE TABLE IF NOT EXISTS audit_log (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      INTEGER NOT NULL DEFAULT (unixepoch()),
        event   TEXT NOT NULL,
        user_id INTEGER,
        ip_hash TEXT,
        detail  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);`,
  },
  {
    name: "003_login_attempts",
    sql: `
      CREATE TABLE IF NOT EXISTS login_attempts (
        key          TEXT PRIMARY KEY,
        count        INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0,
        updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
      );`,
  },
  {
    name: "004_session_metadata",
    sql: `
      ALTER TABLE sessions ADD COLUMN ip_hash TEXT;
      ALTER TABLE sessions ADD COLUMN user_agent TEXT;`,
  },
  {
    name: "005_email_verification",
    sql: `
      ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS email_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);`,
  },
  {
    name: "006_two_factor",
    sql: `
      ALTER TABLE users ADD COLUMN totp_secret TEXT;
      ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS recovery_codes (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used      INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);`,
  },
  {
    name: "007_exercise_cache",
    sql: `
      CREATE TABLE IF NOT EXISTS exercise_info (
        name_key   TEXT PRIMARY KEY,
        info       TEXT,
        fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS exercise_image (
        id           TEXT NOT NULL,
        resolution   INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        bytes        BLOB NOT NULL,
        fetched_at   INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (id, resolution)
      );`,
  },
];

function runMigrations() {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER)");
  const applied = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((r) => r.name));
  const record = db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, unixepoch())");
  const apply = db.transaction((m) => {
    db.exec(m.sql);
    record.run(m.name);
  });
  for (const m of MIGRATIONS) {
    if (!applied.has(m.name)) apply(m);
  }
}
runMigrations();

// Cleanly close the database on shutdown: checkpoint the WAL back into the main
// file (so the on-disk db is self-contained for backups / Litestream) and
// release the handle. Best-effort — never throws during shutdown.
export function closeDatabase() {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // ignore checkpoint failure
  }
  try {
    db.close();
  } catch {
    // already closed
  }
}

// ---- ExerciseDB self-hosted store ------------------------------------------
// Exercise lookups and animated GIF bytes are cached here permanently so the app
// serves demos from its own database — no third-party API at runtime once
// populated. This survives restarts/redeploys and, on Fly, is replicated by
// Litestream. Populate in bulk with `npm run import:gifs`; the runtime also
// fills it lazily when an API key is present.

const EX_MISS_TTL_S = 14 * 24 * 60 * 60; // re-try a cached "not found" after 14 days

const _selExInfo = db.prepare("SELECT info, fetched_at FROM exercise_info WHERE name_key = ?");
const _upExInfo = db.prepare(`
  INSERT INTO exercise_info (name_key, info, fetched_at) VALUES (?, ?, unixepoch())
  ON CONFLICT(name_key) DO UPDATE SET info = excluded.info, fetched_at = excluded.fetched_at
`);
const _countExInfo = db.prepare("SELECT COUNT(*) AS n FROM exercise_info WHERE info IS NOT NULL");
const _selExImg = db.prepare(
  "SELECT content_type, bytes FROM exercise_image WHERE id = ? AND resolution = ?"
);
const _upExImg = db.prepare(`
  INSERT INTO exercise_image (id, resolution, content_type, bytes, fetched_at)
  VALUES (?, ?, ?, ?, unixepoch())
  ON CONFLICT(id, resolution) DO UPDATE SET
    content_type = excluded.content_type, bytes = excluded.bytes, fetched_at = excluded.fetched_at
`);

// Cached lookup result: { hit } false when absent/stale; { hit:true, info } when
// present (info may be null for a remembered "no match").
export function getCachedExerciseInfo(nameKey) {
  const row = _selExInfo.get(nameKey);
  if (!row) return { hit: false };
  if (row.info === null) {
    const fresh = Date.now() / 1000 - row.fetched_at < EX_MISS_TTL_S;
    return fresh ? { hit: true, info: null } : { hit: false };
  }
  try {
    return { hit: true, info: JSON.parse(row.info) };
  } catch {
    return { hit: false };
  }
}
export function setCachedExerciseInfo(nameKey, info) {
  _upExInfo.run(nameKey, info ? JSON.stringify(info) : null);
}
// True once any real exercise is stored — lets the demo feature stay on even
// with no API key (i.e. fully self-hosted).
export const hasStoredExercises = () => _countExInfo.get().n > 0;

export function getCachedExerciseImage(id, resolution) {
  const row = _selExImg.get(id, resolution);
  return row ? { buffer: row.bytes, contentType: row.content_type } : null;
}
export function setCachedExerciseImage(id, resolution, buffer, contentType) {
  _upExImg.run(id, resolution, contentType, buffer);
}

// Distinct exercise names found in users' stored workout plans + history, so the
// bulk importer can self-host exactly the GIFs the app actually shows.
export function getStoredExerciseNames() {
  const names = new Set();
  const rows = db.prepare("SELECT value FROM app_state WHERE key IN ('workoutPlan', 'history')").all();
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value);
      const plans = v?.days ? [v] : Object.values(v || {}).map((d) => d?.workout).filter(Boolean);
      for (const p of plans) {
        for (const day of p.days || []) {
          for (const e of day.exercises || []) if (e?.name) names.add(e.name);
        }
      }
    } catch {
      // skip unparseable rows
    }
  }
  return [...names];
}

// ---- App state -------------------------------------------------------------

// The set of state keys the client may persist. Anything else is rejected so a
// buggy or malicious client can't fill the table with arbitrary rows.
export const STATE_KEYS = [
  "profile",
  "recovery",
  "log",
  "workoutPlan",
  "dietPlan",
  "recoveryPlan",
  "history",
  "mealLog",
  "workoutLog",
  "calendar",
];
const STATE_KEY_SET = new Set(STATE_KEYS);
export const isStateKey = (key) => STATE_KEY_SET.has(key);

const selectAll = db.prepare("SELECT key, value FROM app_state WHERE user_id = ?");
const upsert = db.prepare(`
  INSERT INTO app_state (user_id, key, value, updated_at)
  VALUES (@userId, @key, @value, unixepoch())
  ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

export function getState(userId) {
  const out = {};
  for (const row of selectAll.all(userId)) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      // Skip a corrupt row rather than failing the whole read.
    }
  }
  return out;
}

export function setState(userId, key, value) {
  if (!isStateKey(key)) throw new Error(`unknown state key: ${key}`);
  upsert.run({ userId, key, value: JSON.stringify(value) });
}

export const setManyState = db.transaction((userId, entries) => {
  for (const [key, value] of Object.entries(entries)) {
    if (!isStateKey(key)) continue;
    upsert.run({ userId, key, value: JSON.stringify(value) });
  }
});

// ---- Users -----------------------------------------------------------------

const insertUser = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)");
const selectUserByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const selectUserById = db.prepare(
  "SELECT id, email, created_at, email_verified, totp_enabled FROM users WHERE id = ?"
);
const deleteUserStmt = db.prepare("DELETE FROM users WHERE id = ?");
const setVerifiedStmt = db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?");
const updatePwStmt = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");

export function createUser(email, passwordHash) {
  const info = insertUser.run(email, passwordHash);
  return { id: info.lastInsertRowid, email };
}
export const getUserByEmail = (email) => selectUserByEmail.get(email);
export const getUserById = (id) => selectUserById.get(id);
export const setEmailVerified = (userId) => setVerifiedStmt.run(userId);
export const updatePasswordHash = (userId, hash) => updatePwStmt.run(hash, userId);

// ---- Two-factor (TOTP) -----------------------------------------------------

const selectTotp = db.prepare("SELECT totp_secret, totp_enabled FROM users WHERE id = ?");
const setTotpSecretStmt = db.prepare(
  "UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?"
);
const enableTotpStmt = db.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?");
const disableTotpStmt = db.prepare(
  "UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?"
);
const insertRecovery = db.prepare(
  "INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)"
);
const deleteRecovery = db.prepare("DELETE FROM recovery_codes WHERE user_id = ?");
const findRecovery = db.prepare(
  "SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used = 0"
);
const markRecoveryUsed = db.prepare("UPDATE recovery_codes SET used = 1 WHERE id = ?");
const countUnusedRecovery = db.prepare(
  "SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used = 0"
);

export const getTotp = (userId) => selectTotp.get(userId);
export const setTotpSecret = (userId, secret) => setTotpSecretStmt.run(secret, userId);
export const enableTotp = (userId) => enableTotpStmt.run(userId);
export const disableTotp = db.transaction((userId) => {
  disableTotpStmt.run(userId);
  deleteRecovery.run(userId);
});
// Replace a user's recovery codes with a fresh set of hashes.
export const replaceRecoveryCodes = db.transaction((userId, hashes) => {
  deleteRecovery.run(userId);
  for (const h of hashes) insertRecovery.run(userId, h);
});
// Consume one unused recovery code (returns true if it matched).
export const consumeRecoveryCode = db.transaction((userId, codeHash) => {
  const row = findRecovery.get(userId, codeHash);
  if (!row) return false;
  markRecoveryUsed.run(row.id);
  return true;
});
export const countRecoveryCodes = (userId) => countUnusedRecovery.get(userId).n;

// ---- Email tokens (verification + password reset) --------------------------
// Only the hash of each token is stored; the raw token lives only in the email.

const insertEmailToken = db.prepare(
  "INSERT OR REPLACE INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)"
);
const selectEmailToken = db.prepare(
  "SELECT user_id, kind, expires_at FROM email_tokens WHERE token_hash = ?"
);
const deleteEmailToken = db.prepare("DELETE FROM email_tokens WHERE token_hash = ?");
const deleteUserKindTokens = db.prepare(
  "DELETE FROM email_tokens WHERE user_id = ? AND kind = ?"
);

export function createEmailToken(userId, kind, tokenHash, expiresAtMs) {
  insertEmailToken.run(tokenHash, userId, kind, expiresAtMs);
}
export const deleteUserTokens = (userId, kind) => deleteUserKindTokens.run(userId, kind);

// Validate and consume a token in one atomic step (single use). Returns the
// user id on success, or null if the token is missing, wrong kind, or expired.
export const consumeEmailToken = db.transaction((tokenHash, kind) => {
  const row = selectEmailToken.get(tokenHash);
  if (!row || row.kind !== kind) return null;
  deleteEmailToken.run(tokenHash);
  if (row.expires_at < Date.now()) return null;
  return row.user_id;
});

// Delete a user and all their data (app_state + sessions cascade via FK).
export const deleteUser = (userId) => deleteUserStmt.run(userId);

// A complete, machine-readable export of everything we hold for a user (GDPR/
// CCPA data portability).
export function exportUser(userId) {
  const user = selectUserById.get(userId);
  return {
    exportedAt: new Date().toISOString(),
    user: user ? { id: user.id, email: user.email, created_at: user.created_at } : null,
    state: getState(userId),
    sessions: listSessions(userId).map((s) => ({
      created_at: s.created_at,
      user_agent: s.user_agent,
    })),
  };
}

// ---- Sessions --------------------------------------------------------------

const insertSession = db.prepare(
  "INSERT INTO sessions (token, user_id, expires_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?)"
);
const selectSession = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?");
const deleteSession = db.prepare("DELETE FROM sessions WHERE token = ?");
const deleteExpiredSessions = db.prepare("DELETE FROM sessions WHERE expires_at < unixepoch()");
const selectSessionsByUser = db.prepare(
  "SELECT created_at, expires_at, ip_hash, user_agent FROM sessions WHERE user_id = ? AND expires_at > unixepoch() ORDER BY created_at DESC"
);
const deleteOtherSessions = db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?");
const deleteUserSessions = db.prepare("DELETE FROM sessions WHERE user_id = ?");

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Create a session and return its opaque token. `meta` may carry { ipHash,
// userAgent } for the "active sessions" view.
export function createSession(userId, meta = {}) {
  const token = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  insertSession.run(token, userId, expiresAt, meta.ipHash || null, meta.userAgent || null);
  return token;
}

export function getSessionUserId(token) {
  if (!token) return null;
  const row = selectSession.get(token);
  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    deleteSession.run(token);
    return null;
  }
  return row.user_id;
}

export const destroySession = (token) => token && deleteSession.run(token);
export const purgeExpiredSessions = () => deleteExpiredSessions.run();
export const listSessions = (userId) => selectSessionsByUser.all(userId);
export const destroyOtherSessions = (userId, currentToken) =>
  deleteOtherSessions.run(userId, currentToken || "");
export const destroyAllSessions = (userId) => deleteUserSessions.run(userId);

// ---- Audit log -------------------------------------------------------------
// Records security-relevant events. Stores only a hashed IP and an integer
// user id — never raw IPs, emails, or passwords — so the trail is useful without
// becoming a PII liability.

const insertAudit = db.prepare(
  "INSERT INTO audit_log (event, user_id, ip_hash, detail) VALUES (?, ?, ?, ?)"
);
const selectAudit = db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?");

export function logAudit({ event, userId = null, ipHash = null, detail = null }) {
  try {
    insertAudit.run(event, userId, ipHash, detail == null ? null : String(detail).slice(0, 500));
  } catch {
    // Auditing must never break the request it's recording.
  }
}
export const recentAudit = (limit = 100) => selectAudit.all(limit);

// ---- Failed-login throttling / lockout -------------------------------------

const selectAttempt = db.prepare("SELECT count, locked_until FROM login_attempts WHERE key = ?");
const bumpAttempt = db.prepare(`
  INSERT INTO login_attempts (key, count, locked_until, updated_at)
  VALUES (@key, 1, 0, unixepoch())
  ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = unixepoch()
`);
const setLocked = db.prepare("UPDATE login_attempts SET locked_until = ? WHERE key = ?");
const clearAttempt = db.prepare("DELETE FROM login_attempts WHERE key = ?");

// Returns the epoch-ms time the key is locked until, or 0 if not locked.
export function loginLockedUntil(key) {
  const row = selectAttempt.get(key);
  if (!row) return 0;
  return row.locked_until > Date.now() ? row.locked_until : 0;
}

// Record a failed attempt; once `maxAttempts` is reached, lock for `lockoutMs`.
// Returns the lock-until time (epoch ms) if this attempt triggered a lock, else 0.
export function registerFailedLogin(key, maxAttempts, lockoutMs) {
  bumpAttempt.run({ key });
  const row = selectAttempt.get(key);
  if (row.count >= maxAttempts) {
    const until = Date.now() + lockoutMs;
    setLocked.run(until, key);
    return until;
  }
  return 0;
}
export const clearLoginAttempts = (key) => clearAttempt.run(key);

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

export default db;
