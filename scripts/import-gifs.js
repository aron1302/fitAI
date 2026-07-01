// Bulk-populate the self-hosted exercise demo store (the exercise_info /
// exercise_image tables in the SQLite database) from the free, public-domain
// free-exercise-db dataset. No API key and no quota — run it any time.
// Afterwards the app serves these demos from its own database, offline-capable
// and replicated by Litestream on Fly.
//
// Usage:
//   node scripts/import-gifs.js                 # default exercise set (rule-based plans)
//   node scripts/import-gifs.js --from-db       # also import names found in users' stored plans
//   node scripts/import-gifs.js --names "Deadlift, Lunge, Pull-up"
//
// Env: DB_PATH (defaults to the app's database).
// Safe to re-run: already-stored exercises are skipped (no network call).

import { exerciseInfo, exerciseImage, apiPaused } from "../server/lib/exercisedb.js";
import { getStoredExerciseNames, hasStoredExercises, closeDatabase } from "../server/lib/db.js";

// Mirrors EXERCISE_BANK in server/lib/fallback.js — the exercises the offline
// rule-based engine can put in a plan, so the default import covers them all.
const DEFAULT_EXERCISES = [
  "Barbell Bench Press", "Incline Dumbbell Press", "Overhead Press", "Cable Fly", "Triceps Pushdown",
  "Pull-ups / Lat Pulldown", "Barbell Row", "Seated Cable Row", "Face Pull", "Dumbbell Curl",
  "Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Standing Calf Raise",
  "Goblet Squat", "Dumbbell Bench Press", "One-Arm Dumbbell Row", "Plank",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const out = { fromDb: false, names: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from-db") out.fromDb = true;
    else if (argv[i] === "--names" && argv[i + 1]) {
      out.names = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return out;
}

const sourceDown = () => {
  console.error("\n⚠ Exercise demo source is unreachable. Check your connection and re-run.");
};

async function main() {
  const { fromDb, names: extra } = parseArgs(process.argv.slice(2));
  const fromDbNames = fromDb ? getStoredExerciseNames() : [];
  const names = [...new Set([...DEFAULT_EXERCISES, ...fromDbNames, ...extra])];

  console.log(
    `Importing ${names.length} exercises` +
      (fromDb ? ` (incl. ${fromDbNames.length} from stored plans)` : "") +
      ` into the self-hosted store…\n`
  );

  let stored = 0,
    missed = 0,
    imgFailed = 0;
  for (const name of names) {
    const info = await exerciseInfo(name);
    if (apiPaused()) {
      sourceDown();
      break;
    }
    if (!info) {
      console.log(`  · ${name}: no match`);
      missed++;
      continue;
    }
    const img = await exerciseImage(info.id);
    if (apiPaused()) {
      sourceDown();
      break;
    }
    if (img) {
      console.log(`  ✓ ${name} → ${info.id} (${(img.buffer.length / 1024).toFixed(0)} KB)`);
      stored++;
    } else {
      console.log(`  ? ${name}: matched ${info.id} but image fetch failed`);
      imgFailed++;
    }
    await sleep(150); // be polite to the CDN
  }

  console.log(`\nDone. stored=${stored} no-match=${missed} image-failed=${imgFailed}`);
  console.log(
    hasStoredExercises()
      ? "The self-hosted store has demos — they serve from the app's own database (no key, no quota)."
      : "Nothing stored — check your network connection and re-run."
  );
  closeDatabase();
  // No process.exit(): let the loop drain so pending fetch-timeout timers close
  // cleanly (avoids a libuv exit assertion on Windows).
}

main().catch((err) => {
  console.error("[import-gifs] failed:", err.message);
  closeDatabaseQuiet();
  process.exitCode = 1;
});

function closeDatabaseQuiet() {
  try {
    closeDatabase();
  } catch {
    // ignore
  }
}
