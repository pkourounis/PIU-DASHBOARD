-- Show/hide a technician on the leaderboard & scorecards
alter table public.technician_meta
  add column if not exists display boolean not null default true;

-- Lets the admin know Step 1 credentials are saved without ever reading the
-- secret (used to gate steps 2 & 3). Guarded to people with location access.
create or replace function public.location_has_credentials(p_location_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_location_access(p_location_id) and exists(
    select 1 from public.location_credentials c
    where c.location_id = p_location_id and coalesce(c.st_client_secret,'') <> ''
  );
$$;
revoke all on function public.location_has_credentials(uuid) from public, anon;
grant execute on function public.location_has_credentials(uuid) to authenticated;
