-- Storage bucket for technician photos uploaded from the admin (ServiceTitan photos aren't
-- always available). Public-read so the dashboard can render them; writes are limited to
-- signed-in admin users.
insert into storage.buckets (id, name, public)
values ('tech-photos', 'tech-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "tech-photos public read"  on storage.objects;
drop policy if exists "tech-photos auth insert"  on storage.objects;
drop policy if exists "tech-photos auth update"  on storage.objects;
drop policy if exists "tech-photos auth delete"  on storage.objects;

create policy "tech-photos public read" on storage.objects
  for select using (bucket_id = 'tech-photos');
create policy "tech-photos auth insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'tech-photos');
create policy "tech-photos auth update" on storage.objects
  for update to authenticated using (bucket_id = 'tech-photos') with check (bucket_id = 'tech-photos');
create policy "tech-photos auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'tech-photos');
