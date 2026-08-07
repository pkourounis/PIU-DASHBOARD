# Technician Dashboard — design prototype

`technician-dashboard.html` is the approved **design prototype** for the PatchitUP
location technician dashboard (self-contained, sample data). It is the visual
reference for the real front-end being built in `dashboard/`.

Screens (kiosk auto-rotate + interactive modes):
- **Company Goals** — revenue-to-goal hero, ring gauges (close rate, Google reviews, memberships), mascot badge
- **Technician scorecards** — ServiceTitan photo, name/title/DISC badge, rank medallion, and the four KPIs
  (Revenue, Sales, Opportunity Conversion, Opp Job Avg) vs. team average
- **Leaderboard** — ranked table; kiosk cycles Revenue → Sales → Conversion → Opp Job Avg

Brand assets live in `../assets/`:
- `patchitup-mascot.png` — circle mascot (full color, transparent)
- `patchitup-wordmark-color.webp` — full-color landscape wordmark (light mode)
- `patchitup-wordmark-white.png` / `patchitup-wordmark-blue.png` — 1-color variants (dark / light)
- `patchitup-wordmark-1color.pdf` — original 1-color source

Editable-per-tech fields (title, DISC letter) and per-location goals/reviews are
**admin-entered** (Supabase, later); photos come from ServiceTitan. Revenue, Sales,
Conversion and Opp Job Avg come live from the existing ServiceTitan KPI engine.
