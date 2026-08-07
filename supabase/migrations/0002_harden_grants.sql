-- Hardening pass (from the Supabase security advisor).

-- Lock the ServiceTitan secrets table away from all client roles. The
-- server-side sync uses the service role (which bypasses RLS + grants), and
-- writes go only through save_location_credentials (SECURITY DEFINER).
revoke all on table public.location_credentials from anon, authenticated;

-- Trigger/internal functions must never be callable as RPC endpoints.
revoke all on function public.handle_new_user() from anon, authenticated, public;
revoke all on function public.protect_profile_role() from anon, authenticated, public;

-- The credential-writer RPC is for signed-in super-admins only (guarded inside);
-- keep it off the anonymous surface.
revoke all on function public.save_location_credentials(uuid,text,text) from anon, public;

-- Note: is_super_admin() and has_location_access() intentionally remain
-- executable by authenticated — RLS policy evaluation requires it, and they
-- only ever reveal the caller's own access level.
