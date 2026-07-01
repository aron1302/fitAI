# syntax=docker/dockerfile:1

# ---- Build stage --------------------------------------------------------------
# Full Node image: has the toolchain to compile the better-sqlite3 native addon
# and to run the Vite production build.
FROM node:22-bookworm AS build
WORKDIR /app

# Native build deps (fallback when no prebuilt better-sqlite3 binary is available).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Install all deps (incl. dev) against the lockfile — cached unless deps change.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the source and build the SPA into dist/.
COPY . .
RUN npm run build

# Drop dev dependencies, keeping the compiled better-sqlite3 + runtime deps.
RUN npm prune --omit=dev

# Fetch the Litestream binary (used only when replication is configured).
ARG LITESTREAM_VERSION=0.3.13
RUN curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz" \
  | tar -xz -C /usr/local/bin litestream

# ---- Runtime stage ------------------------------------------------------------
# Slim image: no toolchain, just Node + the prebuilt artifacts.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/data/fitai.db \
    BACKUP_DIR=/data/backups
WORKDIR /app

# tini = correct PID 1 (signal forwarding + zombie reaping); gosu = drop root to
# the unprivileged `node` user after fixing volume ownership at startup.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini gosu \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY litestream.yml ./litestream.yml
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3001

# Entrypoint runs as root only long enough to chown the mounted volume, then
# drops to `node` to run the app (optionally under Litestream).
ENTRYPOINT ["/usr/bin/tini", "--", "./docker-entrypoint.sh"]
