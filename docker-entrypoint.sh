#!/bin/sh
# Container entrypoint. Runs as root just long enough to make the mounted volume
# writable by the unprivileged `node` user, then drops privileges to run the app.
# If LITESTREAM_REPLICA_URL is set, the app runs under Litestream (restoring from
# the replica first if the local DB is missing); otherwise it runs directly off
# the persistent volume.
set -e

: "${DB_PATH:=/data/fitai.db}"
: "${BACKUP_DIR:=/data/backups}"
export DB_PATH BACKUP_DIR

DATA_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DATA_DIR" "$BACKUP_DIR"
chown -R node:node "$DATA_DIR"

if [ -n "$LITESTREAM_REPLICA_URL" ]; then
  if [ ! -f "$DB_PATH" ]; then
    echo "[entrypoint] no local database — attempting Litestream restore…"
    gosu node litestream restore -if-replica-exists -config /app/litestream.yml "$DB_PATH" || true
  fi
  echo "[entrypoint] starting under Litestream replication"
  exec gosu node litestream replicate -config /app/litestream.yml -exec "node server/index.js"
else
  echo "[entrypoint] Litestream disabled (set LITESTREAM_REPLICA_URL to enable offsite backups)"
  exec gosu node node server/index.js
fi
