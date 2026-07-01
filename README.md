# FitAI — AI-Powered Fitness App

A full-stack fitness app with four pages, powered by the **Claude API** (with a
built-in rule-based fallback so everything works even without an API key). Each
user signs in to their own account, and their profile, plans, and logs are
persisted server-side in SQLite.

| Page             | What it does                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard**    | Calories burned, steps, activities completed, readiness score, and live nutrition targets.                                                                                           |
| **Workout Plan** | AI-generated weekly training plan scaled to your goal, age, weight, and today's readiness score. Auto-deloads when you're under-recovered and substitutes movements around injuries. |
| **Diet Plan**    | AI meal plan hitting your calorie/macro targets for your goal.                                                                                                                       |
| **AI Coach**     | Streaming chat with a coach that knows your full profile and recovery state.                                                                                                         |

## How the AI works

- The Express backend (`server/`) calls **Claude (`claude-opus-4-8`)** using the
  official `@anthropic-ai/sdk`. Workout and diet plans use **structured outputs**
  so the UI renders reliable JSON; the coach **streams** token-by-token.
- If `ANTHROPIC_API_KEY` is **not** set (or a call fails), the app transparently
  falls back to a deterministic rule-based engine (`server/lib/fallback.js`) that
  computes BMR/TDEE, macros, readiness-scaled programming, and injury-aware
  substitutions. The sidebar badge shows which mode is active.

## Setup

Requires Node.js 18+.

```bash
npm install

# Optional — enable real AI:
cp .env.example .env      # then paste your key into ANTHROPIC_API_KEY

npm run dev               # starts API (:3001) + Vite dev server (:5173)
```

Open **http://localhost:5173** and **create an account** (email + password).
Then head to the **Profile** page to enter your stats, goal, training days,
injuries, and today's recovery — and explore the Dashboard, generate your
Workout and Diet plans, and chat with the Coach. Your data is saved to your
account, so it's there when you log back in from any browser or window.

### Scripts

```bash
npm run dev          # API (:3001) + Vite dev server (:5173)
npm test             # run the Vitest suite once
npm run test:watch   # re-run tests on change
npm run lint         # ESLint (server + client)
npm run format       # Prettier --write across the repo
```

### Production build

```bash
npm run build     # bundles the frontend to dist/
npm start         # serves the app + API from http://localhost:3001
```

## Accounts & data

> **Security & deployment:** see **[SECURITY.md](./SECURITY.md)** for the full
> security posture (CSRF, headers, auth hardening, 2FA, audit logging, etc.) and
> **[DEPLOY.md](./DEPLOY.md)** for the production runbook (TLS, secrets, backups).
> Note: the legal documents under `client/src/pages/legal/` are **drafts pending
> attorney review**, not final legal text.

- **Authentication.** Email + password with **bcrypt** hashing, a strong password
  policy, failed-login **lockout**, **email verification**, **password reset**, and
  optional **two-factor authentication (TOTP)**. A random session token is stored
  server-side and sent in an **httpOnly cookie** (never exposed to client JS);
  sessions last 30 days and are revocable. All data routes require a valid session
  and a CSRF token.
- **Persistence.** Your profile, recovery inputs, plans, meal log, and history
  are stored in a **SQLite** database (`fitai.db`, created automatically on first
  run) and scoped to your user account. `localStorage` is used only as an
  instant-load cache — the server is the source of truth, so your data follows
  you across browsers, windows, and ports. The `fitai.db*` files are gitignored.
- **Validation.** Every request body and every AI-generated plan is validated
  with **Zod** before it's used, so malformed input or a bad model response can't
  crash the app — an invalid AI plan transparently falls back to the rule-based
  engine.
- **Rate limiting.** The AI-backed endpoints are throttled (30 requests/min per
  IP) to protect against runaway clients and abuse.
- **What leaves your machine.** When cloud AI is enabled, your profile and
  recovery data are sent to the configured provider (Anthropic or Gemini) to
  generate plans and coach replies. With the local Ollama or rule-based engine,
  nothing leaves your machine.

## Tech

**Frontend:** React + Vite · React Router · plain-CSS design system · error
boundary.
**Backend:** Express · better-sqlite3 · bcryptjs + cookie sessions · Zod
validation · express-rate-limit · Anthropic / Gemini / Ollama providers with a
rule-based fallback.
**Tooling:** Vitest · ESLint · Prettier · JSDoc types.
