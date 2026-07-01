# Deployment & Security Operations

This document covers running FitAI in production safely. It pairs with the
hardening built into the app (helmet, CSRF, auth lockout, audit logging, session
revocation, data export/delete).

> **Status note:** the security and operational controls here are implemented and
> tested in code. The **legal documents** (Terms, Privacy, Health Disclaimer,
> cookie/consent text) are **drafts that must be reviewed by a qualified attorney
> before launch** — see `client/src/pages/legal/`. A health + AI app handling
> personal data under GDPR/CCPA should not go live on unreviewed legal text.

## Deploying to Fly.io (recommended)

The repo ships a production `Dockerfile`, `fly.toml`, `docker-entrypoint.sh`, and
`litestream.yml`. Fly is a good fit because FitAI uses **SQLite** (a single-writer
local file): Fly gives it a **persistent volume**, builds the native
`better-sqlite3` module from the Dockerfile, terminates **TLS automatically**, and
lets you pin to a **single machine**.

> **One-writer rule.** SQLite must run on exactly one machine. The provided
> `fly.toml` sets `auto_stop_machines = "off"` and `min_machines_running = 1` —
> never `fly scale count` above 1, or each machine gets its own volume and the
> data splits. To grow beyond one machine, migrate the DB to Turso/libSQL or
> Postgres first.

**1. Install & sign in**

```bash
# https://fly.io/docs/flyctl/install/
fly auth login
```

**2. Edit `fly.toml`** — set a globally-unique `app`, your `primary_region`, and
`APP_URL` (use `https://<app>.fly.dev` until you attach a custom domain).

**3. Create the app + volume** (volume region must match `primary_region`):

```bash
fly apps create <your-app-name>
fly volumes create fitai_data --region <region> --size 1   # 1 GB; grow later with `fly volumes extend`
```

**4. Set secrets** (encrypted; injected at runtime — never put these in `fly.toml`):

```bash
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)
fly secrets set ANTHROPIC_API_KEY=sk-ant-...          # or GEMINI_API_KEY; omit for rule-based
fly secrets set SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... \
                MAIL_FROM="FitAI <no-reply@your-domain>"
# Optional off-site backups (see §7a):
fly secrets set LITESTREAM_REPLICA_URL=s3://your-bucket/fitai \
                AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
```

**5. Deploy & verify**

```bash
fly deploy
fly logs            # watch boot; "running on http://localhost:3001"
fly open            # opens https://<app>.fly.dev
curl https://<app>.fly.dev/healthz   # {"status":"ok",...}
```

**6. Custom domain** (optional)

```bash
fly certs add app.example.com        # then add the shown A/AAAA/CNAME records
fly secrets set APP_URL=https://app.example.com   # or edit fly.toml [env] + redeploy
```

**Updates:** `fly deploy` does a rolling release; the app handles `SIGTERM`
(drains in-flight requests, checkpoints the WAL) so deploys are clean.

## 1. Environment & secrets (#10)

Set these in the production environment (never commit them):

| Variable             | Required | Purpose |
| -------------------- | -------- | ------- |
| `NODE_ENV`           | yes      | Set to `production` — enables secure cookies, HSTS, strict secret checks. |
| `SESSION_SECRET`     | **yes**  | ≥32 random chars. HMAC key for IP hashing and server-side signing. Generate with `openssl rand -hex 32`. |
| `TRUST_PROXY`        | yes*     | `1` (or hop count/subnet) when behind a TLS-terminating proxy. Required for correct client IPs and secure cookies. |
| `ALLOWED_ORIGINS`    | no       | Comma-separated origins allowed to call the API with credentials. Empty = same-origin only (the default for the bundled SPA). |
| `DB_PATH`            | no       | Path to the SQLite file (default `./fitai.db`). Put it on persistent storage. |
| `MAX_LOGIN_ATTEMPTS` | no       | Failed logins before lockout (default 8). |
| `LOCKOUT_MINUTES`    | no       | Lockout duration (default 15). |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OLLAMA_*` | no | AI providers. Omit for the rule-based engine. |

The server **refuses to start in production** if `SESSION_SECRET` is missing or
weak (see `server/lib/config.js`). Rotate `SESSION_SECRET` by setting a new value
and restarting; this invalidates IP-hash continuity in the audit log but does not
log users out (session tokens are random, not derived from the secret).

## 2. TLS / HTTPS termination (#6)

The app does **not** terminate TLS itself — run it behind a reverse proxy that
does, and forward to the Node process on a private port. Set `TRUST_PROXY=1` so
Express sees the real client IP and marks cookies `Secure`.

**Caddy** (automatic certificates):

```
fitai.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

**nginx** (with certs from certbot/Let's Encrypt):

```nginx
server {
    listen 443 ssl http2;
    server_name fitai.example.com;
    ssl_certificate     /etc/letsencrypt/live/fitai.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fitai.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
# Redirect http -> https
server { listen 80; server_name fitai.example.com; return 301 https://$host$request_uri; }
```

HSTS (`max-age` 1 year, `includeSubDomains`, `preload`) is sent automatically in
production via helmet — only enable `preload` submission once you're sure all
subdomains are HTTPS-only.

## 3. Security headers (#8) & CSRF (#7)

- **helmet** sets a strict Content-Security-Policy (same-origin scripts/connect,
  `frame-ancestors 'none'`, `object-src 'none'`), `X-Content-Type-Options`,
  `Referrer-Policy`, and HSTS. Config: `server/index.js`.
- **CSRF**: double-submit cookie. The server issues a non-httpOnly `fitai_csrf`
  cookie; the SPA echoes it in `X-CSRF-Token` on every state-changing request.
  Mismatches are rejected with 403. Code: `server/lib/csrf.js`.

## 4. Authentication hardening (#9)

Implemented: bcrypt (cost 12), strong password policy, per-account failed-login
lockout, no user-enumeration (constant-time compare + identical errors), stricter
rate limiting on auth routes, audit logging of auth events, **email verification**,
**password reset** (see §4a), and **two-factor authentication** (see §4b).

## 4b. Two-factor authentication (TOTP)

- RFC 6238 TOTP (SHA-1, 6 digits, 30s) implemented directly on Node crypto and
  unit-tested against the RFC's published vectors; QR provisioning via `qrcode`.
- Login is two-step when 2FA is on: password → a short-lived **signed challenge**
  (HMAC, no server storage) → authenticator code. Failed codes count toward the
  same lockout as passwords.
- **Recovery codes**: 10 single-use codes issued at enrolment, stored only as
  SHA-256 hashes. Login and disable accept a recovery code as a fallback.
- Manage from Profile → Privacy & Security (enable/disable, regenerate codes).
- The TOTP secret is stored in the DB; for higher assurance, encrypt it at rest
  with a KMS-managed key (left as a hardening follow-up).

## 4a. Email verification & password reset (#9)

- Signup sends a verification email; the email is a **soft gate** (a banner
  prompts verification but doesn't block usage).
- Tokens are single-use and time-limited (verify 24h, reset 1h). Only a SHA-256
  **hash** of each token is stored, so a database leak can't be used to verify
  emails or reset passwords. Completing a reset revokes all sessions.
- Configure SMTP via `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (or
  `SMTP_URL`) and `MAIL_FROM`, and set `APP_URL` to your public origin so links
  resolve. **Without SMTP, emails are printed to the server log** — fine for dev,
  not for production.

## 5. Sessions (#11)

Server-side opaque tokens in the `sessions` table, 30-day expiry, purged on boot
and on access. Users can **log out other devices** or **log out everywhere**
(revoke all) from Profile → Privacy & Security. Endpoints: `/api/auth/sessions`,
`/api/auth/logout-others`, `/api/auth/logout-all`.

## 6. Audit logging (#13)

`audit_log` records auth and account events (`signup`, `login_success`,
`login_fail`, `login_lockout_triggered`, `logout*`, `account_export`,
`account_delete`). It stores an **integer user id and a hashed IP only** — never
raw IPs, emails, or passwords — so the trail is useful without becoming a PII
liability. Review with a read-only query against `audit_log`.

## 7. Database migrations & backups (#20)

- **Migrations** run automatically on boot via a versioned runner
  (`schema_migrations` table) in `server/lib/db.js`. They are idempotent and safe
  to apply to an existing database. Add new schema as a new entry in the
  `MIGRATIONS` array — never edit an applied migration.
- **Backups**: `npm run backup` writes a consistent online snapshot (WAL-safe)
  to `./backups` and prunes to the newest `BACKUP_KEEP` (default 14). Schedule it:

  ```
  0 3 * * *  cd /app && DB_PATH=/data/fitai.db BACKUP_DIR=/data/backups node scripts/backup.js
  ```

  Test restores periodically: a backup file is a complete SQLite database —
  point `DB_PATH` at a copy and start the app to verify.

## 7a. Off-site backups with Litestream (Fly)

On Fly there are three layers of durability:

- **The volume** persists the DB across restarts/deploys (primary).
- **Fly volume snapshots** are taken daily automatically (5-day default retention) —
  disaster recovery for the whole disk.
- **Litestream** (optional, built into the image) continuously streams the WAL to
  object storage for point-in-time off-site recovery. Enable it by setting
  `LITESTREAM_REPLICA_URL` + bucket credentials as secrets (see the Fly section
  above and `litestream.yml`). When set, the container restores from the replica
  on first boot and replicates continuously; when unset, the app runs straight
  off the volume.

The local `npm run backup` snapshot still works too — run it on demand against the
volume with `fly ssh console -C "node scripts/backup.js"`.

## 7b. Self-hosted exercise demos

Exercise demo photos come from the free, public-domain **free-exercise-db**
dataset (Unlicense) — **no API key and no quota**. Each looked-up record + photo
is cached permanently in the app's **own SQLite database** (replicated by
Litestream, restored on a fresh machine), so demos are served from your origin
and keep working offline. They're fetched lazily on first view; a brief cooldown
covers a temporary source outage (uncached exercises fall back to the built-in
animated SVGs).

To pre-populate the store in bulk (recommended before launch — no key needed,
runs any time):

```bash
# locally (writes into your DB_PATH), or on Fly:
npm run import:gifs                 # the default rule-based exercise set
npm run import:gifs -- --from-db    # also import exercises from users' saved plans
fly ssh console -C "npm run import:gifs"   # run it on the deployed volume
```

## 8. CI/CD & dependency scanning (#19, #12)

- `.github/workflows/ci.yml`: lint, test, build on every push/PR, plus an
  `npm audit` job that **fails on high/critical advisories in production
  dependencies**.
- `.github/dependabot.yml`: weekly dependency and GitHub-Actions update PRs.

## 9. Roadmap (explicitly not done)

These need external services or product decisions and were left as clearly-marked
follow-ups rather than shipped half-finished:

- Legal text review and finalisation by counsel (#14–18).
- Encrypting the TOTP secret at rest with a KMS-managed key.
- Centralised log shipping / SIEM integration and alerting on the audit log.
