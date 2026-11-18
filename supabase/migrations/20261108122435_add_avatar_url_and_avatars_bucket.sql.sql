-- 1. Add avatar_url column
alter table public.profiles
  add column if not exists avatar_url text;

-- 2. Create avatars bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']
where not exists (select 1 from storage.buckets where id = 'avatars');

-- 3. Storage policies: each user owns their own folder
drop policy if exists "avatars_select_all" on storage.objects;
create policy "avatars_select_all" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
