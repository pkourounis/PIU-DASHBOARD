-- Seed: Nassau County location, its goals, and technician meta (title/DISC).
-- Idempotent — safe to re-run.
with loc as (
  insert into public.locations (name, code, region, market, state, st_env, is_active)
  values ('Nassau County','NC','Long Island, NY','Metro New York','NY','production', true)
  on conflict (name) do update set is_active = true
  returning id
)
insert into public.location_goals (location_id, revenue_target, close_rate_target, memberships_target,
  reviews_target, reviews_actual, reviews_rating, reviews_total, cancellations)
select id, 350000, 0.65, 35, 60, 47, 4.8, 326, 11 from loc
on conflict (location_id) do update set
  revenue_target=excluded.revenue_target, close_rate_target=excluded.close_rate_target,
  memberships_target=excluded.memberships_target, reviews_target=excluded.reviews_target,
  reviews_actual=excluded.reviews_actual, reviews_rating=excluded.reviews_rating,
  reviews_total=excluded.reviews_total, cancellations=excluded.cancellations, updated_at=now();

insert into public.technician_meta (location_id, name, title, disc)
select l.id, v.name, v.title, v.disc
from public.locations l
join (values
  ('Marcus Reyes','Lead Technician','D'),
  ('Danielle Cho','Senior Technician','I'),
  ('Andre Willis','Lead Technician','D'),
  ('Sofia Marino','Technician','C'),
  ('Priya Nair','Technician','I'),
  ('Tyrone Jackson','Technician','S'),
  ('Luis Fernández','Technician','C'),
  ('Kevin O''Brien','Apprentice','S')
) as v(name,title,disc) on true
where l.name = 'Nassau County'
  and not exists (select 1 from public.technician_meta tm where tm.location_id = l.id and tm.name = v.name);
