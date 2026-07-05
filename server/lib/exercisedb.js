// Exercise demo provider. Demos come from the free, public-domain
// free-exercise-db dataset (see freeexercisedb.js) — no API key and no request
// quota. Every looked-up record + image is cached permanently in the app's own
// database (db.js), so demos are served from our own origin, survive restarts/
// redeploys, are replicated by Litestream on Fly, and keep working offline.
//
// Populate in bulk with `npm run import:gifs`; the runtime also fills the store
// lazily for any new exercise. If the source is temporarily unreachable, a short
// cooldown avoids hammering it and uncached exercises fall back to the built-in
// animated SVG demos.

import {
  getCachedExerciseInfo,
  setCachedExerciseInfo,
  hasStoredExercises,
  getCachedExerciseImage,
  setCachedExerciseImage,
} from "./db.js";
import { freeLookup, freeImage } from "./freeexercisedb.js";

// The demo feature is always available: a free source plus the SVG fallback.
export function exerciseDbEnabled() {
  return true;
}

// After a source/network error we pause calls briefly so a transient outage
// doesn't trigger a request per render. `apiPaused` is also used by the importer.
let cooldownUntil = 0;
export const apiPaused = () => Date.now() < cooldownUntil;
function tripCooldown() {
  cooldownUntil = Date.now() + 5 * 60 * 1000;
}

// Placeholder names the client seeds for not-yet-named exercises. These carry
// no information about the movement, so any lookup "match" would be wrong.
// Checked before the cache so historic bogus matches for them stop serving too.
const PLACEHOLDER_NAME = /^new exercise\b/;

// Resolve an exercise name to its record ({ id, name, target, ... }) or null.
// Serves from the self-hosted store first; otherwise looks it up in the free
// dataset and caches the result. Never throws.
export async function exerciseInfo(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (PLACEHOLDER_NAME.test(key)) return null;
  const cached = getCachedExerciseInfo(key);
  if (cached.hit) return cached.info;
  if (apiPaused()) return null;

  let info = null;
  try {
    info = await freeLookup(name);
  } catch {
    tripCooldown(); // source error — don't persist, retry later
    return null;
  }
  setCachedExerciseInfo(key, info); // persist the found result OR a genuine miss
  return info;
}

// Demo photo bytes for an exercise id. Serves from the store first; otherwise
// fetches from the free source and stores it permanently. Never throws.
export async function exerciseImage(id, resolution = 0) {
  if (!id) return null;
  const cached = getCachedExerciseImage(id, resolution);
  if (cached) return cached;
  if (apiPaused()) return null;
  try {
    const img = await freeImage(id);
    setCachedExerciseImage(id, resolution, img.buffer, img.contentType);
    return img;
  } catch {
    tripCooldown();
    return null;
  }
}

// Re-exported so callers can check whether anything has been self-hosted yet.
export { hasStoredExercises };
