-- Per-location shareable view-only dashboard links.
-- Each location gets an opaque, unguessable share_token. A public URL like
-- /PIU/<token> opens that one location's dashboard, view-only, with no login.
-- The token maps to the location through public_dashboard(), a SECURITY DEFINER
-- RPC that returns ONLY public-safe fields (name, goals, technician display meta)
-- for the single matching location — never credentials or other locations.

-- URL-safe opaque token (~16 chars). gen_random_bytes comes from pgcrypto, which
-- Supabase installs into the "extensions" schema — reference it explicitly and
-- strip the base64 chars that are unsafe in a path.
create extension if not exists pgcrypto with schema extensions;
create or replace function public.gen_share_token()
returns text language sql volatile set search_path = public, extensions as $$
  select translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=', '');
$$;

alter table public.locations
  add column if not exists share_token text unique;

-- Backfill any existing rows and make the token mandatory going forward.
update public.locations set share_token = public.gen_share_token() where share_token is null;
alter table public.locations alter column share_token set default public.gen_share_token();

-- Public, read-only projection of one location by its share token. Anonymous
-- (anon) may call it, but it only ever exposes one active location's public
-- overlay — the same data the dashboard already renders for a signed-in viewer.
create or replace function public.public_dashboard(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare loc public.locations; result jsonb;
begin
  if p_token is null or length(p_token) < 6 then return null; end if;
  select * into loc from public.locations
    where share_token = p_token and is_active is true limit 1;
  if loc.id is null then return null; end if;
  select jsonb_build_object(
    'location', jsonb_build_object('id', loc.id, 'name', loc.name, 'st_tenant_id', loc.st_tenant_id),
    'goals', (select to_jsonb(g) - 'location_id' - 'updated_at'
              from public.location_goals g where g.location_id = loc.id),
    'techs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'st_tech_id', t.st_tech_id, 'name', t.name, 'title', t.title,
        'disc', t.disc, 'photo_url', t.photo_url) order by t.name)
      from public.technician_meta t
      where t.location_id = loc.id and t.display is true), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.public_dashboard(text) from public;
grant execute on function public.public_dashboard(text) to anon, authenticated;

-- Rotate (revoke) a location's share link. Super-admin only; returns the new token.
create or replace function public.rotate_share_token(p_location_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  tok := public.gen_share_token();
  update public.locations set share_token = tok where id = p_location_id;
  return tok;
end $$;
revoke all on function public.rotate_share_token(uuid) from public, anon;
grant execute on function public.rotate_share_token(uuid) to authenticated;
