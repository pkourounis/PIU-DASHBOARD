-- Move the ServiceTitan App Key (ST-App-Key header) into per-location credentials, so a
-- location is brought fully live from the admin UI alone — no per-location env vars.

-- Store the app key alongside the client id/secret (write-only, never read to the browser).
alter table public.location_credentials
  add column if not exists st_app_key text;

-- Save credentials now takes the app key too. Every field preserves its current value when
-- passed blank, so you can update just one without re-entering the others.
drop function if exists public.save_location_credentials(uuid, text, text);
create or replace function public.save_location_credentials(
  p_location_id uuid, p_client_id text, p_client_secret text, p_app_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  insert into public.location_credentials(location_id, st_client_id, st_client_secret, st_app_key, updated_at)
  values (p_location_id, nullif(p_client_id,''), nullif(p_client_secret,''), nullif(p_app_key,''), now())
  on conflict (location_id) do update set
    st_client_id     = coalesce(nullif(excluded.st_client_id,''),     public.location_credentials.st_client_id),
    st_client_secret = coalesce(nullif(excluded.st_client_secret,''), public.location_credentials.st_client_secret),
    st_app_key       = coalesce(nullif(excluded.st_app_key,''),       public.location_credentials.st_app_key),
    updated_at = now();
end $$;
revoke all on function public.save_location_credentials(uuid, text, text, text) from public, anon;
grant execute on function public.save_location_credentials(uuid, text, text, text) to authenticated;

-- Step 1 isn't complete until the app key is stored too (alongside client id + secret).
create or replace function public.location_has_credentials(p_location_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_location_access(p_location_id) and exists(
    select 1 from public.location_credentials c
    where c.location_id = p_location_id
      and coalesce(c.st_client_secret,'') <> ''
      and coalesce(c.st_client_id,'') <> ''
      and coalesce(c.st_app_key,'') <> ''
  );
$$;
revoke all on function public.location_has_credentials(uuid) from public, anon;
grant execute on function public.location_has_credentials(uuid) to authenticated;
