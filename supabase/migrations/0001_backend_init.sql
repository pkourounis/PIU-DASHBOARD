-- PatchitUP location technician dashboard — backend schema
-- Roles: super_admin (manages locations, users, everything) and franchisee
-- (views + edits their own location's goals, review counts, and tech title/DISC).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'franchisee' check (role in ('super_admin','franchisee')),
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- locations
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text,
  region text,
  market text,
  state text,
  st_tenant_id text,
  st_env text not null default 'production' check (st_env in ('production','integration')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ServiceTitan client secrets — never exposed to the browser. RLS on with NO
-- policies means only the service role (server-side sync) and SECURITY DEFINER
-- functions can touch it.
create table public.location_credentials (
  location_id uuid primary key references public.locations(id) on delete cascade,
  st_client_id text,
  st_client_secret text,
  updated_at timestamptz not null default now()
);

-- which franchisee can access which location
create table public.location_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  primary key (user_id, location_id)
);

-- per-location technician overrides (title, DISC letter, optional photo).
-- Matched to ServiceTitan by st_tech_id, or by name for manual entries.
create table public.technician_meta (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  st_tech_id text,
  name text,
  title text,
  disc char(1) check (disc in ('D','I','S','C')),
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, st_tech_id)
);

-- per-location company goals (current targets + admin-entered review numbers)
create table public.location_goals (
  location_id uuid primary key references public.locations(id) on delete cascade,
  revenue_target numeric not null default 0,
  close_rate_target numeric not null default 0,   -- 0..1
  memberships_target int not null default 0,
  reviews_target int not null default 0,
  reviews_actual int not null default 0,
  reviews_rating numeric,
  reviews_total int,
  cancellations int not null default 0,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------- helper predicates
-- SECURITY DEFINER so RLS policies can call them without recursing into the
-- same tables' policies.
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.has_location_access(loc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists(
    select 1 from public.location_access la where la.user_id = auth.uid() and la.location_id = loc
  );
$$;

-- ------------------------------------------------- auth user -> profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.email),
          case when new.email = 'pkourounis@gmail.com' then 'super_admin' else 'franchisee' end)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- prevent non-super-admins from changing a profile's role
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'only a super_admin can change a role';
  end if;
  return new;
end $$;

create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- --------------------------------------------- secure credential upsert RPC
-- Lets a super_admin save ServiceTitan secrets from the admin UI without ever
-- granting the browser read access to the credentials table.
create or replace function public.save_location_credentials(
  p_location_id uuid, p_client_id text, p_client_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  insert into public.location_credentials(location_id, st_client_id, st_client_secret, updated_at)
  values (p_location_id, p_client_id, p_client_secret, now())
  on conflict (location_id) do update
    set st_client_id = excluded.st_client_id,
        st_client_secret = excluded.st_client_secret,
        updated_at = now();
end $$;
revoke all on function public.save_location_credentials(uuid,text,text) from public;
grant execute on function public.save_location_credentials(uuid,text,text) to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.profiles            enable row level security;
alter table public.locations           enable row level security;
alter table public.location_credentials enable row level security;   -- no policies: locked to service role
alter table public.location_access     enable row level security;
alter table public.technician_meta     enable row level security;
alter table public.location_goals      enable row level security;

-- profiles: read own or (super_admin) all; update own; super_admin updates any
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles
  for update using (public.is_super_admin()) with check (public.is_super_admin());

-- locations: accessible rows readable; only super_admin writes
create policy locations_select on public.locations
  for select using (public.has_location_access(id));
create policy locations_insert on public.locations
  for insert with check (public.is_super_admin());
create policy locations_update on public.locations
  for update using (public.is_super_admin()) with check (public.is_super_admin());
create policy locations_delete on public.locations
  for delete using (public.is_super_admin());

-- location_access: users see own rows; super_admin manages
create policy la_select on public.location_access
  for select using (user_id = auth.uid() or public.is_super_admin());
create policy la_all on public.location_access
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- technician_meta + goals: anyone with access to the location can read & edit
create policy tm_select on public.technician_meta
  for select using (public.has_location_access(location_id));
create policy tm_write on public.technician_meta
  for all using (public.has_location_access(location_id)) with check (public.has_location_access(location_id));

create policy lg_select on public.location_goals
  for select using (public.has_location_access(location_id));
create policy lg_write on public.location_goals
  for all using (public.has_location_access(location_id)) with check (public.has_location_access(location_id));
