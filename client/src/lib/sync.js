// Reliable persistence of per-user state to the server.
//
// Server saves used to be fire-and-forget: a PUT that failed (dead gym
// network, free-tier host mid-cold-start, HTTP error) was silently dropped,
// the data lived only in this device's localStorage cache, and the next
// boot-time hydration replaced that cache with the older server copy —
// destroying the sets the user had just logged. This module closes that hole:
//
//  - the latest value of each state key is queued and retried with backoff
//    until the server confirms the write, including when the browser comes
//    back online;
//  - keys with unconfirmed writes are recorded in localStorage, so a boot
//    after a failed session knows the local cache is AHEAD of the server and
//    must win (or be merged), not be replaced;
//  - the queue starts held and is released only after boot hydration has
//    reconciled server and local state, so a stale cache is never pushed over
//    newer data from another device;
//  - subscribers (the SyncBadge in the app chrome) see how many keys still
//    await confirmation, so an unsynced workout is visible instead of silent.

import { saveState } from "./api.js";

// localStorage record of state keys whose latest local value the server has
// not confirmed: { [key]: true }. Cleared per-key on a confirmed save, and
// wholesale on logout (it lives under the fitai.* cache prefix).
const UNSYNCED_LS_KEY = "fitai.unsynced";

export function unsyncedKeys() {
  try {
    return new Set(Object.keys(JSON.parse(localStorage.getItem(UNSYNCED_LS_KEY)) || {}));
  } catch {
    return new Set();
  }
}

function markUnsynced(key, on) {
  try {
    const flags = {};
    for (const k of unsyncedKeys()) flags[k] = true;
    if (on) flags[key] = true;
    else delete flags[key];
    localStorage.setItem(UNSYNCED_LS_KEY, JSON.stringify(flags));
  } catch {
    // storage unavailable — the in-memory queue still retries this session
  }
}

// Drop a stale unsynced flag whose cached value no longer exists.
export function clearUnsynced(key) {
  markUnsynced(key, false);
}

const pending = new Map(); // key -> latest value awaiting confirmation
let held = true; // no sends until boot hydration has reconciled state
let flushing = false;
let failures = 0; // consecutive failed sends, drives backoff + badge
let retryTimer = null;
const listeners = new Set();

const status = () => ({ pending: pending.size, retrying: failures > 0 });

function notify() {
  const s = status();
  for (const l of listeners) l(s);
}

// Subscribe to queue status ({ pending, retrying }); returns an unsubscribe.
// The listener is called immediately with the current status.
export function subscribeSync(listener) {
  listeners.add(listener);
  listener(status());
  return () => listeners.delete(listener);
}

// Queue the latest value of a state key for saving. Newer values for the same
// key supersede older ones — the server only ever needs the most recent.
export function enqueueSave(key, value) {
  pending.set(key, value);
  markUnsynced(key, true);
  notify();
  void flush();
}

// Called once per boot, after hydration has merged server and local state.
export function releaseSaves() {
  held = false;
  void flush();
}

async function flush() {
  if (held || flushing) return;
  flushing = true;
  while (pending.size) {
    const [key, value] = pending.entries().next().value;
    try {
      await saveState(key, value);
      failures = 0;
      // Only settle the key if nothing newer was queued while in flight.
      if (pending.get(key) === value) {
        pending.delete(key);
        markUnsynced(key, false);
      }
      notify();
    } catch {
      failures += 1;
      notify();
      // Back off (2s, 4s, … capped at 30s) and try again.
      const delay = Math.min(2000 * 2 ** (failures - 1), 30000);
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void flush();
        }, delay);
      }
      flushing = false;
      return;
    }
  }
  flushing = false;
  notify();
}

if (typeof window !== "undefined") {
  // Retry immediately when connectivity returns instead of waiting out backoff.
  window.addEventListener("online", () => {
    failures = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    void flush();
  });
  // Closing the app with unconfirmed writes risks the exact data loss this
  // module exists to prevent — let the browser warn before leaving.
  window.addEventListener("beforeunload", (e) => {
    if (pending.size) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
