// Fitbit Web API integration (OAuth 2.0 authorization-code flow with PKCE).
//
// Fitbit is the one consumer tracker with a free, public API, so it's the first
// real provider. Setup: create an app at https://dev.fitbit.com/apps (type
// "Server"), set the redirect URL to `${APP_URL}/api/trackers/fitbit/callback`,
// and put FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET in the environment.
//
// Tokens are stored AES-GCM-encrypted (cryptobox.js). The signed OAuth "state"
// travels in a short-lived httpOnly cookie so the callback can verify both the
// user and the PKCE verifier without server-side session storage.

import crypto from "node:crypto";
import { config } from "./config.js";
import { encrypt, decrypt } from "./cryptobox.js";
import {
  saveTrackerAccount,
  getTrackerAccount,
  removeTrackerAccount,
  saveTrackerTokens,
  saveDailyActivity,
  getDailyActivity,
} from "./db.js";

const AUTHORIZE_URL = "https://www.fitbit.com/oauth2/authorize";
const TOKEN_URL = "https://api.fitbit.com/oauth2/token";
const REVOKE_URL = "https://api.fitbit.com/oauth2/revoke";
const API_BASE = "https://api.fitbit.com";
const SCOPE = "activity"; // steps, calories, active minutes — nothing more

export const PROVIDER = "fitbit";
export const OAUTH_COOKIE = "fitai_fitbit_oauth";
const OAUTH_TTL_MS = 10 * 60 * 1000; // finish the Fitbit consent screen within 10 min

export function fitbitEnabled() {
  return Boolean(process.env.FITBIT_CLIENT_ID && process.env.FITBIT_CLIENT_SECRET);
}

const redirectUri = () => `${config.appUrl}/api/trackers/fitbit/callback`;

const basicAuth = () =>
  "Basic " +
  Buffer.from(`${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`).toString(
    "base64"
  );

// ---- Signed OAuth state (same HMAC pattern as the 2FA challenge) ----
function sign(payload) {
  return crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}
function packState(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function unpackState(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = sign(payload);
  if (!sig || sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// Build the Fitbit consent-screen URL and the matching state cookie value.
// The cookie holds { uid, state, verifier } signed with the session secret; the
// `state` query param is echoed back by Fitbit and must match the cookie's.
export function beginAuth(userId) {
  const state = crypto.randomBytes(16).toString("hex");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const cookieValue = packState({ uid: userId, state, verifier, exp: Date.now() + OAUTH_TTL_MS });
  const url =
    `${AUTHORIZE_URL}?` +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.FITBIT_CLIENT_ID,
      redirect_uri: redirectUri(),
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
  return { url, cookieValue, cookieMaxAge: OAUTH_TTL_MS };
}

async function tokenRequest(params) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.errors?.[0]?.message || `HTTP ${r.status}`;
    throw new Error(`Fitbit token endpoint: ${msg}`);
  }
  return data;
}

function storeTokens(userId, data) {
  saveTrackerAccount({
    userId,
    provider: PROVIDER,
    accessTokenEnc: encrypt(data.access_token),
    refreshTokenEnc: data.refresh_token ? encrypt(data.refresh_token) : null,
    expiresAt: Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600),
    externalId: data.user_id || null,
    scope: data.scope || SCOPE,
  });
}

// Complete the OAuth flow from the callback request. Verifies the signed cookie
// against the echoed `state`, exchanges the code, and stores encrypted tokens.
// Returns the user id on success; throws with a safe message on any failure.
export async function completeAuth({ cookie, state, code }) {
  const data = unpackState(cookie);
  if (!data || !state || data.state !== state) {
    throw new Error("The connection attempt expired or didn't match — please try again.");
  }
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code: String(code || ""),
    redirect_uri: redirectUri(),
    code_verifier: data.verifier,
    client_id: process.env.FITBIT_CLIENT_ID,
  });
  storeTokens(data.uid, tokens);
  return data.uid;
}

// A valid access token for the user, refreshing (and re-storing) if expired.
// Returns null when the user has no usable Fitbit connection.
async function accessToken(userId) {
  const acct = getTrackerAccount(userId, PROVIDER);
  if (!acct) return null;
  const now = Math.floor(Date.now() / 1000);
  if (acct.expires_at > now + 60) {
    return decrypt(acct.access_token_enc);
  }
  const refresh = acct.refresh_token_enc && decrypt(acct.refresh_token_enc);
  if (!refresh) return null;
  const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  saveTrackerTokens(
    userId,
    PROVIDER,
    encrypt(tokens.access_token),
    tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    Math.floor(Date.now() / 1000) + (Number(tokens.expires_in) || 3600)
  );
  return tokens.access_token;
}

// Sync the daily activity summary for `date` (YYYY-MM-DD, the user's local day)
// into daily_activity. Returns the stored row, or null if not connected.
export async function syncDay(userId, date) {
  const token = await accessToken(userId);
  if (!token) return null;
  const r = await fetch(`${API_BASE}/1/user/-/activities/date/${date}.json`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Fitbit activity fetch failed (HTTP ${r.status})`);
  const data = await r.json();
  const s = data?.summary || {};
  const row = {
    userId,
    date,
    steps: Number(s.steps) || 0,
    caloriesOut: Number(s.caloriesOut) || 0,
    activeMinutes: (Number(s.fairlyActiveMinutes) || 0) + (Number(s.veryActiveMinutes) || 0),
    provider: PROVIDER,
  };
  saveDailyActivity(row);
  return getDailyActivity(userId, date);
}

// Disconnect: best-effort revoke at Fitbit, then delete our stored tokens.
export async function disconnect(userId) {
  const acct = getTrackerAccount(userId, PROVIDER);
  if (acct) {
    const token = decrypt(acct.access_token_enc);
    if (token) {
      try {
        await fetch(REVOKE_URL, {
          method: "POST",
          headers: {
            Authorization: basicAuth(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ token }).toString(),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // revocation is best-effort; deleting our copy is what matters
      }
    }
  }
  removeTrackerAccount(userId, PROVIDER);
}
