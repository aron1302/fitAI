---
name: verify
description: Build, run, and drive FitAI (Express + Vite React SPA) to verify a change end-to-end in a real browser.
---

# Verifying FitAI changes

## Launch (two processes, throwaway DB)

```powershell
# API server on :3001 with a scratch SQLite DB (never touch fitai.db in repo root)
$env:DB_PATH="<tmp>\verify.db"; $env:PORT="3001"; node server/index.js
# Vite dev server on :5173 (proxies /api -> :3001)
npx vite --port 5173 --strictPort
```

Ready when `http://localhost:5173/` and `http://localhost:3001/api/status` both return 200.
`.env` in the repo root may enable a real AI provider (Gemini); without keys the app
falls back to rule-based plan generation — both paths work for verification.

## Driving with Playwright

`playwright` is NOT a repo dependency — install it in a scratch dir
(`npm i playwright && npx playwright install chromium`), then drive `http://localhost:5173`.

Flow gotchas learned the hard way:

- **Signup first**: Auth page defaults to login. Click the "Sign up" toggle
  (`.auth-switch .auth-link`), fill `input[type=email]` / `input[type=password]`,
  submit via `.auth-submit`. Email verification is NOT required to use the app
  (a banner shows instead). Verification links print to the server console.
- **Complete onboarding or be redirected**: a fresh account gets bounced to
  `/profile` on every full page load until the profile is saved. Click
  "Save profile" before navigating anywhere (defaults are fine).
- **Generate a plan via UI**: on `/workout` click "Generate plan". The button
  re-renders into a spinner immediately — use `click({ force: true, noWaitAfter: true })`
  or Playwright times out on "element is not stable". Plan is ready when the
  button reads "Regenerate"; failures render `.banner`.
- Deep-link pages like `/workout/log/0` work by direct `page.goto` once a plan exists.
- Modals (`.modal-overlay`) have a 0.15s fade-in — `waitForTimeout(300)` before
  screenshotting or you capture an invisible dialog.
- Headless Chromium has no emoji font: emoji render as checkered boxes in
  screenshots. Cosmetic only.

## State model (what persists where)

Client state lives in AppContext, cached in localStorage (`fitai.*`) and persisted
per-key to `PUT /api/state/:key`. New state keys must be added to `STATE_KEYS` in
`server/lib/db.js` or the server rejects the write with 400.
