// Free, public-domain exercise demo source: yuhonas/free-exercise-db (~870
// exercises with static photos + instructions, released under the Unlicense).
// No API key and no request quota, so demos work out of the box and offline once
// cached. Used to fill the self-hosted store in db.js; the app then serves the
// images from its own database.

const DATASET_URL =
  process.env.FREE_EXERCISE_DB_URL ||
  "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json";
const IMG_BASE =
  process.env.FREE_EXERCISE_IMG_BASE ||
  "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/";

const STOP = new Set(["the", "a", "an", "with", "to", "of", "and", "or", "on", "in", "for"]);
export function tokenize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

// Lazily fetch + cache the dataset (≈2 MB) in memory; re-armable on failure.
let datasetPromise = null;
function loadDataset() {
  if (!datasetPromise) {
    datasetPromise = fetch(DATASET_URL, { signal: AbortSignal.timeout(15000) })
      .then((r) => {
        if (!r.ok) throw new Error(`dataset ${r.status}`);
        return r.json();
      })
      .then((arr) => arr.map((e) => ({ ...e, _tokens: tokenize(e.name) })))
      .catch((err) => {
        datasetPromise = null; // allow a later retry
        throw err;
      });
  }
  return datasetPromise;
}

// Two tokens match if equal, or the longer is the shorter plus a 1–2 char suffix
// — enough for singular/plural and minor variants ("row"↔"rows",
// "raise"↔"raises") without letting "over" match "overhead" or "back" match
// "backward".
function tokenMatches(a, b) {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 3 && l.startsWith(s) && l.length - s.length <= 2;
}

// Best dataset entry for an app exercise name, by distinct-token overlap. Prefers
// a matching prefix (e.g. "Barbell Bench Press" → "Barbell Bench Press - Medium
// Grip" over "Barbell Guillotine Bench Press") then the fewest extra words.
// Exported for tests.
export function bestMatch(dataset, name) {
  const q = tokenize(name);
  if (!q.length) return null;
  let best = null;
  let bestMatched = 0,
    bestPrefix = 0,
    bestExtra = Infinity;
  for (const e of dataset) {
    // Count DISTINCT query tokens present in the entry (so an entry that merely
    // repeats one query word, e.g. "...Press...Press...", doesn't score higher).
    let matched = 0;
    for (const t of q) if (e._tokens.some((et) => tokenMatches(t, et))) matched++;
    if (matched === 0) continue;
    const prefix = q.every((t, i) => e._tokens[i] && tokenMatches(t, e._tokens[i])) ? 1 : 0;
    const extra = e._tokens.length - matched;
    if (
      matched > bestMatched ||
      (matched === bestMatched && prefix > bestPrefix) ||
      (matched === bestMatched && prefix === bestPrefix && extra < bestExtra)
    ) {
      best = e;
      bestMatched = matched;
      bestPrefix = prefix;
      bestExtra = extra;
    }
  }
  // Require a reasonable overlap so we don't return a spurious match. Multi-word
  // names need at least two matching words — one shared word (e.g. the
  // "exercise" in "New exercise" vs "Exercise Ball Crunch") says nothing about
  // the movement, and a wrong photo is worse than the neutral placeholder.
  const needed = Math.max(q.length > 1 ? 2 : 1, Math.ceil(q.length / 2));
  if (!best || bestMatched < needed) return null;
  return best;
}

function toInfo(e) {
  return {
    id: e.id,
    name: e.name,
    target: e.primaryMuscles?.[0] || "",
    bodyPart: e.category || "",
    equipment: e.equipment || "",
    secondaryMuscles: e.secondaryMuscles || [],
    instructions: e.instructions || [],
  };
}

// Hand-mapped demos for the app's own compound exercise names, which the token
// matcher can't resolve (e.g. "Cat–cow & open-book rotations"). Keys are the
// normalized app names; values are exact dataset names. Both dash variants are
// listed where the app copy uses an en dash.
const ALIASES = new Map([
  ["cat–cow & open-book rotations", "Cat Stretch"],
  ["cat-cow & open-book rotations", "Cat Stretch"],
  ["wall slides & band pass-throughs", "Band Pull Apart"],
  ["slow neck rotations & upper-trap stretch", "Side Neck Stretch"],
  ["single-leg balance hold", "Balance Board"],
]);

// Resolve an app exercise name to a dataset record, or null. May throw on a
// network error (caller treats that as "try again later").
export async function freeLookup(name) {
  const dataset = await loadDataset();
  const alias = ALIASES.get(String(name).toLowerCase().trim());
  const e = alias ? dataset.find((x) => x.name === alias) : bestMatch(dataset, name);
  return e ? toInfo(e) : null;
}

// Fetch the demo photo bytes for a dataset id (its first image, the start
// position). Image paths are `<id>/0.jpg`. May throw on a network error.
export async function freeImage(id) {
  const r = await fetch(IMG_BASE + encodeURI(`${id}/0.jpg`), {
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`image ${r.status}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  return { buffer, contentType: r.headers.get("content-type") || "image/jpeg" };
}
