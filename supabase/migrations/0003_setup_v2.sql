-- Setup v2: membership split, goal periods, review/analytics connection fields,
-- and a super-admin "create user" function.

-- Review + analytics connection points on the location (GoHighLevel is the
-- review source; GA/Place id kept as optional alternates).
alter table public.locations
  add column if not exists ghl_location_id text,
  add column if not exists google_place_id text,
  add column if not exists ga_property_id text;

-- Goals: split memberships into HomeGuard + Power Partner targets, and make the
-- period explicit per goal. The old single memberships_* columns stay for now
-- but are no longer edited in the admin. "Sold"/rating/review actuals are NOT
-- stored here — they come from ServiceTitan / GoHighLevel at sync time.
alter table public.location_goals
  add column if not exists homeguard_target int not null default 0,
  add column if not exists power_partner_target int not null default 0,
  add column if not exists revenue_period text not null default 'monthly' check (revenue_period in ('monthly','annual')),
  add column if not exists memberships_period text not null default 'annual' check (memberships_period in ('monthly','annual')),
  add column if not exists reviews_period text not null default 'monthly' check (reviews_period in ('monthly','annual'));

-- Super-admin provisions a login (email+password), sets role, and optionally
-- grants a location — all from the admin UI. Guarded to super_admins.
create or replace function public.admin_create_user(
  p_email text, p_password text, p_role text, p_location_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; em text := lower(trim(p_email));
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if p_role not in ('franchisee','super_admin') then raise exception 'invalid role'; end if;
  if em = '' or p_password is null or length(p_password) < 8 then raise exception 'email required and password must be at least 8 characters'; end if;
  if exists (select 1 from auth.users where email = em) then raise exception 'a user with that email already exists'; end if;
  uid := gen_random_uuid();
  insert into auth.users (
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
    raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,
    email_change,email_change_token_current,reauthentication_token,phone_change,phone_change_token,
    is_sso_user,is_anonymous)
  values (
    '00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',em,
    crypt(p_password, gen_salt('bf')),now(),now(),now(),
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,'','','','','','','','',
    false,false);
  insert into auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
  values (gen_random_uuid(),uid,jsonb_build_object('sub',uid::text,'email',em,'email_verified',true),'email',em,now(),now(),now());
  update public.profiles set role = p_role where id = uid;
  if p_location_id is not null then
    insert into public.location_access(user_id, location_id) values (uid, p_location_id) on conflict do nothing;
  end if;
  return uid;
end $$;
revoke all on function public.admin_create_user(text,text,text,uuid) from public, anon;
grant execute on function public.admin_create_user(text,text,text,uuid) to authenticated;

-- Demo membership targets for Nassau so the dashboard shows something sensible
update public.location_goals lg
set homeguard_target = 150, power_partner_target = 40, memberships_period = 'annual'
from public.locations l
where l.id = lg.location_id and l.name = 'Nassau County' and lg.homeguard_target = 0;
