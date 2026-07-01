# Security Overview

This document summarises FitAI's security posture: what's implemented and tested,
where it lives in the code, what remains, and how to report a vulnerability. The
operational runbook (TLS, secrets, backups, env) is in **[DEPLOY.md](./DEPLOY.md)**.

> **Honest scope note.** The technical controls below are implemented and tested.
> The **legal documents** (Terms, Privacy, Health Disclaimer, cookie text) are
> **drafts that require review by a qualified attorney** before launch — they ship
> with a prominent "DRAFT — NOT LEGALLY REVIEWED" banner. Do not treat them as
> final. TLS certificate provisioning is infrastructure handled at your proxy/host.

## Status at a glance

| # | Item | Status | Where |
| - | ---- | ------ | ----- |
| 6 | HTTPS/TLS termination | ✅ Supported (app) · 📄 provisioned at proxy | `config.js` (trust proxy, secure cookies, HSTS); `DEPLOY.md` §2 |
| 7 | CSRF protection | ✅ Implemented & tested | `server/lib/csrf.js`; client `api.js` |
| 8 | Security headers (helmet) | ✅ Implemented & verified | `server/index.js` (CSP/HSTS/…) |
| 9 | Auth hardening | ✅ Implemented & tested | `auth.js`, `password.js`, `totp.js`, `email.js` |
| 10 | Secrets management & rotation | ✅ Validation & hashing · 📄 storage is infra | `server/lib/config.js`; `DEPLOY.md` §1 |
| 11 | Session revocation & expiry | ✅ Implemented & tested | `auth.js`, `db.js`; Profile UI |
| 12 | Dependency/vuln scanning | ✅ CI + Dependabot | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| 13 | Audit logging (no PII) | ✅ Implemented & tested | `db.js` (`audit_log`), `config.js` (IP hashing) |
| 14–18 | Legal & compliance | 🟡 Mechanics built · ⚖️ text needs counsel | `client/src/pages/legal/`, `CookieConsent.jsx`, account export/delete |
| 19 | CI/CD pipeline | ✅ lint + test + build | `.github/workflows/ci.yml` |
| 20 | Migrations & backups | ✅ Implemented & tested | `db.js` (migration runner), `scripts/backup.js` |

Legend: ✅ done & tested · 🟡 partial/scaffolded · 📄 documented/infrastructure · ⚖️ needs legal review

## Authentication & account security (#9)

- **Passwords**: bcrypt (cost 12); strength policy (length + character-class /
  passphrase rules, common-password and email-echo rejection) in `password.js`.
- **No user enumeration**: constant-time compare with a dummy hash; identical
  errors and timing whether or not the email exists.
- **Lockout**: per-account failed-login throttling (`login_attempts`), plus a
  stricter rate limiter on auth routes.
- **Email verification**: signup sends a verification link (soft-gate banner).
- **Password reset**: tokenised email flow; reset revokes all sessions.
- **Two-factor (TOTP)**: RFC 6238 (validated against the RFC test vectors),
  two-step login via a signed stateless challenge, 10 single-use recovery codes
  (stored hashed). Failed second-factor attempts count toward lockout.

## Tokens & secrets (#10)

- `SESSION_SECRET` is validated at boot (fatal in production if missing/weak).
- Email/reset tokens: only a **SHA-256 hash** is stored; the raw token lives only
  in the email and is single-use + time-limited (verify 24h, reset 1h).
- Recovery codes: stored as SHA-256 hashes, single-use.
- IP addresses in the audit log are **HMAC-hashed** with the session secret —
  raw IPs are never persisted.

## Transport & headers (#6, #8)

- helmet sets a strict CSP (`default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, same-origin script/connect; `style-src` allows
  `'unsafe-inline'` only because the SPA uses React inline-style attributes),
  plus nosniff, Referrer-Policy, COOP/CORP, and HSTS in production.
- CSRF: double-submit cookie with a constant-time check on all state-changing
  requests; the SPA echoes the token in `X-CSRF-Token`.
- CORS is same-origin by default (`ALLOWED_ORIGINS` opens specific origins).

## Sessions (#11)

Opaque server-side tokens, 30-day expiry, purged on boot and on access. Users can
**log out other devices** or **everywhere** from Profile → Privacy & Security.
Password reset and 2FA-disable also revoke sessions where appropriate.

## Audit logging (#13)

`audit_log` records auth/account events (`signup`, `login_success`, `login_fail`,
`login_lockout_triggered`, `login_2fa_*`, `logout*`, `email_verified`,
`password_reset*`, `twofa_*`, `account_export`, `account_delete`). It stores only
an integer user id and a hashed IP — **no raw IPs, emails, or passwords**.

## Privacy & compliance mechanics (#14–18)

- **Data export** (download JSON) and **account deletion** (cascading) — Profile →
  Privacy & Security. AI/third-party data flow is disclosed in the UI and Privacy
  policy. Cookie notice reflects that only strictly-necessary cookies are used.
- Draft Terms / Privacy / Health Disclaimer live at `/legal/*` (publicly
  reachable) with DRAFT banners. **The text must be completed and approved by an
  attorney before launch.**

## Reliability & supply chain (#12, #19, #20)

- CI runs lint + test + build on every push/PR and fails on high/critical
  production-dependency advisories (`npm audit`). Dependabot opens weekly update
  PRs for dependencies and Actions.
- Schema changes go through an idempotent, versioned migration runner. `npm run
  backup` makes WAL-safe online snapshots with pruning.

## Test coverage

`test/security.test.js` covers password policy, CSRF token comparison, IP
hashing, email/reset token hashing, TOTP (incl. RFC 6238 vectors), and the 2FA
login challenge. The full suite (lint + tests + build) runs in CI. Auth, CSRF,
lockout, email, and 2FA flows were additionally verified end-to-end against a
running server.

## Reporting a vulnerability

Please report security issues privately to **aronjames214@gmail.com** — do **not**
open public GitHub issues for vulnerabilities. Where possible, include steps to
reproduce, the affected endpoint(s)/version, impact, and any proof-of-concept.

We aim to **acknowledge within 3 business days** and to share a remediation
timeline after triage. Please allow a reasonable window to fix and release before
public disclosure — we suggest **90 days, coordinated**. A machine-readable
contact is published at `/.well-known/security.txt` (RFC 9116).

> **Note:** this is a personal address for now. Before/after launch, swap in a
> dedicated `security@<your-domain>` alias and update both this file and
> `client/public/.well-known/security.txt` (and add `Canonical`/`Policy` URLs).

## Known follow-ups (not yet done)

- Legal text review & finalisation by counsel (#14–18).
- Encrypting the TOTP secret at rest with a KMS-managed key.
- Centralised log shipping / SIEM + alerting on audit events.
- WebAuthn/passkeys as a phishing-resistant alternative to TOTP (optional).
