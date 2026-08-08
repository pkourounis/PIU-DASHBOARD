-- Lets the Netlify sync read active locations + their ServiceTitan credentials without a
-- service_role key. A random shared secret gates a read-only SECURITY DEFINER RPC that anon
-- may call with that secret.
--
-- The secret ROW is seeded out-of-band (never committed), e.g.:
--   insert into private.sync_secret(id, secret) values(true, '<random-64-hex>')
--     on conflict (id) do update set secret = excluded.secret;
-- The same value is stored on Netlify as SYNC_TENANTS_SECRET (and SUPABASE_ANON_KEY is the
-- publishable key). Rotate by updating both the row and the env var.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Singleton table holding the shared secret. Never exposed to anon/authenticated (private
-- schema isn't in PostgREST's exposed schemas, and no grants are given here).
create table if not exists private.sync_secret(
  id boolean primary key default true,
  secret text not null,
  constraint sync_secret_singleton check (id)
);
revoke all on table private.sync_secret from anon, authenticated;

-- Returns one row per fully-connected active location with its credentials joined in, but only
-- when called with the shared secret. SECURITY DEFINER so it can read private.sync_secret and
-- the credentials while anon itself has no direct access to either.
create or replace function public.sync_tenants(p_secret text)
returns table(
  name text, code text, region text, market text, state text,
  st_tenant_id text, st_env text,
  st_client_id text, st_client_secret text, st_app_key text
) language plpgsql security definer set search_path = public, private as $$
begin
  if p_secret is null or length(p_secret) < 16
     or p_secret <> (select s.secret from private.sync_secret s limit 1) then
    raise exception 'forbidden';
  end if;
  return query
    select l.name, l.code, l.region, l.market, l.state,
           l.st_tenant_id::text, coalesce(l.st_env,'production'),
           c.st_client_id, c.st_client_secret, c.st_app_key
    from public.locations l
    join public.location_credentials c on c.location_id = l.id
    where l.is_active is true
      and l.st_tenant_id is not null
      and coalesce(c.st_client_id,'') <> ''
      and coalesce(c.st_client_secret,'') <> '';
end $$;

revoke all on function public.sync_tenants(text) from public;
grant execute on function public.sync_tenants(text) to anon, authenticated;
