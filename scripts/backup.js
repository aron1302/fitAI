// Online, consistent backup of the SQLite database using better-sqlite3's
// backup API (safe to run while the server is live — it checkpoints WAL and
// copies a transactionally-consistent snapshot). Old backups are pruned.
//
// Usage:   node scripts/backup.js
// Env:     DB_PATH (source db), BACKUP_DIR (default ./backups), BACKUP_KEEP (default 14)
// Cron:    e.g. `0 3 * * * cd /app && node scripts/backup.js >> /var/log/fitai-backup.log 2>&1`

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "fitai.db");
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
const KEEP = Number(process.env.BACKUP_KEEP) || 14;

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backup] source database not found: ${DB_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUP_DIR, `fitai-${stamp}.db`);

  const db = new Database(DB_PATH, { readonly: true });
  await db.backup(dest);
  db.close();
  console.log(`[backup] wrote ${dest}`);

  // Prune: keep only the newest KEEP backups.
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^fitai-.*\.db$/.test(f))
    .sort()
    .reverse();
  for (const old of backups.slice(KEEP)) {
    fs.rmSync(path.join(BACKUP_DIR, old));
    console.log(`[backup] pruned ${old}`);
  }
}

main().catch((err) => {
  console.error("[backup] failed:", err.message);
  process.exit(1);
});
