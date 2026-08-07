# PatchitUP backend (Supabase)

Postgres + Auth backing the location technician dashboard: user roles, per-location
admin data (titles, DISC letters, goals, review counts), location access, and the
ServiceTitan connection secrets for self-serve "add a location".

- **Project ref:** `lzptesxrzzhrngphbdbq` · URL `https://lzptesxrzzhrngphbdbq.supabase.co`
- Public (browser) URL + publishable key live in `dashboard/supabase-config.js`.

## Roles
- **super_admin** — manages all locations, users, credentials, goals, tech meta.
  `pkourounis@gmail.com` is auto-promoted to super_admin on first sign-up (see
  `handle_new_user`). Change/extend that rule in a migration.
- **franchisee** — sees only locations granted via `location_access`, and can edit
  that location's goals, review counts, and each tech's title/DISC.

## Tables
| table | purpose |
|-------|---------|
| `profiles` | one row per auth user: email, full_name, role |
| `locations` | location metadata + ServiceTitan tenant id + env (no secrets) |
| `location_credentials` | ServiceTitan client id/secret — **service-role only** (RLS on, no policies; client roles revoked) |
| `location_access` | which franchisee can access which location |
| `technician_meta` | per-location tech title / DISC / photo, matched by `st_tech_id` or name |
| `location_goals` | per-location revenue/close/membership/review targets + review counts |

## Security model
- RLS is on for every table. `is_super_admin()` and `has_location_access(loc)`
  (SECURITY DEFINER) drive the policies.
- `location_credentials` is unreadable by `anon`/`authenticated`. Writes go only
  through `save_location_credentials(location_id, client_id, client_secret)`
  (SECURITY DEFINER, super_admin-guarded). The server-side ServiceTitan sync reads
  it with the **service role** key.

## Applying
Migrations in `migrations/` are already applied to the project above. To reproduce
on a fresh project: run `0001_backend_init.sql`, then `0002_harden_grants.sql`, then
`seed.sql` (or `supabase db push` with the Supabase CLI).

## Next
- Point the front-end `OVERLAY` layer at `location_goals` + `technician_meta`
  (via supabase-js, using the signed-in session).
- Admin UI (super-admin + franchisee) for the CRUD.
- Move the ServiceTitan sync to read tenants/credentials from Supabase (service
  role) instead of `TENANTS_JSON`.
