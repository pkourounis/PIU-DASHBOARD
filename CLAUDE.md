# PatchitUP — Nassau County Technician Leaderboard

A **single‑location, franchisee‑facing** dashboard for the **Nassau County** PatchitUP owner: a
technician leaderboard + scorecards built on live ServiceTitan data. Seeded from the corporate
multi‑location dashboard, so the infrastructure and metric engine are already proven here. This
file is the context pack — read it before touching metrics. The metric rules below were verified
against ServiceTitan's own dashboard, location by location; treat them as ground truth.

## What this project is (vs. the corporate dashboard it came from)

- **One tenant: Nassau County.** Single‑location is purely a config difference — the code is
  tenant‑agnostic. Set `TENANTS_JSON` (Netlify) / `tenants.json` (local) to just Nassau.
- **Technician‑first.** The primary screen should be the **technician leaderboard** (Top Revenue,
  Top Sales, Opp Job Avg, Close Rate, productivity/hour) and per‑tech **scorecards**, all
  **date‑range filterable**. The location‑level KPIs (Revenue, Sales, Opp Job Avg, Opportunities,
  Conversion Rate, Memberships, Cancellations) are context, not the headline.
- **Owner‑facing.** Drop corporate‑only UI (region roll‑ups, multi‑location grid, "add location").

### First tasks for a new session
1. Reshape `dashboard/index.html` to open on the Nassau technician view (leaderboard + scorecards)
   instead of a location grid. The design system, charts, drawer, and all tech math already exist.
2. Stand up a **Netlify site** for this repo and set env vars (below), then Sync.
3. Consider gating/removing `/api/debug/:tenant` before sharing with the owner.

## Architecture (inherited, unchanged)

- **`dashboard/index.html`** — the entire front‑end: one self‑contained HTML file (inline CSS + JS,
  no build, no external requests). This is the design system — match its look and idioms. Runs
  **live** (reads the API) or **sample** (`MockSource` demo data). `Adapter` picks mode from
  `/api/health`.
- **Two backends share one KPI engine** (`dashboard/server/src/provider.js`):
  - **Netlify Functions** (`netlify/functions/`, prod) + Netlify Blobs. Scheduled `sync-hourly`
    (`@hourly`) triggers background `sync` (`/api/sync`); served via `/api/locations`,
    `/api/locations/:t/daily`, `/technicians`, `/tech-daily`, `/api/health`. `/api/debug/:tenant`
    is a diagnostic dump.
  - **Node/Express** (`dashboard/server/src/`) — same provider for local dev + tests.
- `provider.js` (KPI + technician math) and `servicetitan.js` (OAuth client) are shared; Netlify
  imports them by relative path, so a fix lands everywhere. New backend fields need a **Sync** to
  backfill; front‑end‑only changes just need a reload.

## ServiceTitan API

- OAuth 2.0 **client‑credentials**; tokens ~15 min, cached per clientId. Every request needs
  `Authorization: Bearer` + `ST-App-Key`. Base `https://api.servicetitan.io`.
- Endpoints: estimates `/sales/v2`, jobs `/jpm/v2`, invoices `/accounting/v2`, appointments
  `/jpm/v2/.../appointments`, appointment‑assignments `/dispatch/v2`, memberships `/memberships/v2`,
  technicians `/settings/v2`. **Always paginate all pages** (`getAll`).
- **Secrets live only in env vars — never commit them.** Netlify: `TENANTS_JSON` (Nassau only),
  `ST_APP_KEY`, `ST_ENV`, `REFRESH_DAYS` (120), `BACKFILL_DAYS` (400). `.gitignore` excludes `.env`,
  `tenants.json`, `data/`. See `dashboard/server/.env.example` + `tenants.example.json`.

## Metric definitions (VERIFIED — do not "improve" without data). `SOLD_THRESHOLD = 65`.

- **Revenue (Completed Revenue)** = Σ invoice **`subTotal`** on completed opportunity jobs, on the
  **completion day**. ⚠️ Invoice income field is **`subTotal`** (capital T, pre‑tax). Reading
  `total` counts sales tax and overstated taxed locations — the single biggest bug we fixed.
- **Sales (Total Sales)** = Σ `subtotal` of estimates **sold** that day, on the **sold day**.
  (Estimates use lowercase `subtotal`; invoices use `subTotal`.)
- **Opportunity** = a completed job that isn't No‑Charge, or is No‑Charge but invoiced **over $65**.
- **Converted** = an opportunity whose invoice `subTotal` is **over $65**.
- **Opportunity Conversion Rate / Close Rate** = converted / opportunities.
- **Opp Job Avg** = Revenue / Opportunities. **Cancellations** = Canceled appointments (appt day).
  **Memberships Sold** = memberships with a sold/created date in range.

### Technician metrics — the heart of this project
`buildTechDaily` row = `[opps, converted, options, sales, pipeline, hours, jobs, completedRevenue]`.
- **Attribution**: the tech who **ran** a job = its appointment‑assignment (`jobTech` map), not the
  estimate's `soldBy` — so an unsold opportunity is still attributed.
- **Sales** (`revenue` field = sold estimate value) books on the **sold day**.
- **Opportunities + conversions** book on the estimate **create day** → close rate is a coherent
  cohort ≤ 100% for any range.
- **Labor hours** = Σ appointment (`end` − `start`) for the tech's assignments; **Sales/hr = sales ÷
  hours**. Shared jobs credit each assigned tech the full duration (no split).
- **Completed (invoice) revenue per tech** = `subTotal` on completed jobs the tech ran (distinct
  from Sales) → leaderboard "Top Revenue".
- Every technician view is driven by the top toolbar's date‑range selector.

## Gotchas / lessons (inherited)

- **Never let a periodic refresh fall back to sample data.** Only the initial load may set
  `mode='sample'`; a refresh stays live and keeps the last good data on any fetch blip (else the
  15‑min tick flashes fabricated demo numbers).
- **UTC day bucketing** — days sliced from UTC ISO, so late‑evening‑local jobs can land a day off;
  matters at month/quarter/year boundaries. Not yet localized per tenant.
- **Recalls/warranty** (`recallForId`/`warrantyId`) currently count as opportunities; ServiceTitan
  may exclude them — confirm before filtering.
- **"Total Revenue"** in ServiceTitan = completed + non‑job + adjustment revenue; we compute only
  completed‑job revenue.
- Not sourced live yet (render **N/A**, don't fake): CSAT, booking rate, per‑tech memberships.

## Dev workflow

- Tests: `cd dashboard/server && npm test` (mock ServiceTitan + unit/pipeline). Add a test when you
  change metric math. Validate `index.html` by parsing its inline `<script>`.
- Mock (`test/mock-st.js`) uses lowercase `subtotal`; the `subTotal ?? subtotal` fallback keeps both
  tests and live correct.
- Deploy = push the branch (once this repo's Netlify site is connected). Verify the deploy, then
  Sync. Commit messages end with the Co‑Authored‑By + Claude‑Session trailers.
