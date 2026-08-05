# PIU-DASHBOARD — Nassau County Technician Leaderboard

Single-location, franchisee-facing PatchitUP dashboard for **Nassau County**: a technician
leaderboard + scorecards on live ServiceTitan data. Seeded from the corporate multi-location
dashboard, so the ServiceTitan client, KPI engine, and design system are already proven.

**Start here:** read [`CLAUDE.md`](./CLAUDE.md) — it's the full context pack (architecture,
ServiceTitan API, verified metric rules, and the technician-first build plan).

## Layout
- `dashboard/index.html` — the entire front-end (self-contained design system).
- `dashboard/server/` — Node/Express backend + the shared KPI engine (`src/provider.js`) and
  ServiceTitan client (`src/servicetitan.js`), plus tests (`npm test`).
- `netlify/functions/` — production serverless backend (hourly sync into Netlify Blobs).

## Config (never commit secrets)
Set `TENANTS_JSON` (Nassau only), `ST_APP_KEY`, `ST_ENV` as Netlify env vars. Locally, copy
`dashboard/server/.env.example` → `.env` and `tenants.example.json` → `tenants.json`.
