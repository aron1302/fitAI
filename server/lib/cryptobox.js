// Symmetric encryption for secrets we store on behalf of users (e.g. fitness
// tracker OAuth tokens). AES-256-GCM with a key derived from SESSION_SECRET, so
// a leaked database alone is not enough to use the tokens — the attacker would
// also need the server's secret.

import crypto from "node:crypto";
import { config } from "./config.js";

// Derive a stable 32-byte key from the session secret (scryptSync is memory-hard
// and runs once per process thanks to the cache).
let _key = null;
function key() {
  if (!_key) _key = crypto.scryptSync(config.sessionSecret, "fitai.cryptobox.v1", 32);
  return _key;
}

// Encrypt a UTF-8 string. Output: base64url(iv | authTag | ciphertext).
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

// Decrypt a value produced by encrypt(). Returns null (never throws) on any
// tamper/format/wrong-key failure so callers can treat it as "token lost".
export function decrypt(boxed) {
  try {
    const buf = Buffer.from(String(boxed), "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
