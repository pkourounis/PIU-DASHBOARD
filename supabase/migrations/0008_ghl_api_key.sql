-- Store a GoHighLevel Private Integration Token per location (for pulling Google reviews),
-- alongside the ServiceTitan credentials. Write-only; never read back to the browser.
alter table public.location_credentials
  add column if not exists ghl_api_key text;

-- save_location_credentials now also takes the GHL token (preserve-on-blank like the rest).
create or replace function public.save_location_credentials(
  p_location_id uuid, p_client_id text, p_client_secret text,
  p_app_key text default null, p_ghl_api_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  insert into public.location_credentials(location_id, st_client_id, st_client_secret, st_app_key, ghl_api_key, updated_at)
  values (p_location_id, nullif(p_client_id,''), nullif(p_client_secret,''), nullif(p_app_key,''), nullif(p_ghl_api_key,''), now())
  on conflict (location_id) do update set
    st_client_id     = coalesce(nullif(excluded.st_client_id,''),     public.location_credentials.st_client_id),
    st_client_secret = coalesce(nullif(excluded.st_client_secret,''), public.location_credentials.st_client_secret),
    st_app_key       = coalesce(nullif(excluded.st_app_key,''),       public.location_credentials.st_app_key),
    ghl_api_key      = coalesce(nullif(excluded.ghl_api_key,''),      public.location_credentials.ghl_api_key),
    updated_at = now();
end $$;
revoke all on function public.save_location_credentials(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_location_credentials(uuid, text, text, text, text) to authenticated;

-- sync_tenants now also returns the GoHighLevel location id + token so the backend can pull reviews.
drop function if exists public.sync_tenants(text);
create or replace function public.sync_tenants(p_secret text)
returns table(
  name text, code text, region text, market text, state text,
  st_tenant_id text, st_env text,
  st_client_id text, st_client_secret text, st_app_key text,
  ghl_location_id text, ghl_api_key text
) language plpgsql security definer set search_path = public, private as $$
begin
  if p_secret is null or length(p_secret) < 16
     or p_secret <> (select s.secret from private.sync_secret s limit 1) then
    raise exception 'forbidden';
  end if;
  return query
    select l.name, l.code, l.region, l.market, l.state,
           l.st_tenant_id::text, coalesce(l.st_env,'production'),
           c.st_client_id, c.st_client_secret, c.st_app_key,
           l.ghl_location_id, c.ghl_api_key
    from public.locations l
    join public.location_credentials c on c.location_id = l.id
    where l.is_active is true
      and l.st_tenant_id is not null
      and coalesce(c.st_client_id,'') <> ''
      and coalesce(c.st_client_secret,'') <> '';
end $$;
revoke all on function public.sync_tenants(text) from public;
grant execute on function public.sync_tenants(text) to anon, authenticated;
