-- =====================================================================
-- Tekniq Platform — 0005: storage bucket for store media
-- Files are stored as  media/<store_id>/<uuid>.<ext>
-- Anyone can read (images are shown on public storefronts); only editors of
-- that store can upload / replace / delete inside its own folder.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'video/mp4', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- first path segment -> store uuid (null when it is not a uuid)
create or replace function public.storage_store_id(p_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when (string_to_array(p_name, '/'))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((string_to_array(p_name, '/'))[1])::uuid end
$$;
revoke all on function public.storage_store_id(text) from public, anon, authenticated;
grant execute on function public.storage_store_id(text) to anon, authenticated;

create policy "media_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'media');

create policy "media_editor_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
              and public.storage_store_id(name) is not null
              and public.has_store_role(public.storage_store_id(name), 'editor'));

create policy "media_editor_update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.storage_store_id(name) is not null
         and public.has_store_role(public.storage_store_id(name), 'editor'))
  with check (bucket_id = 'media' and public.storage_store_id(name) is not null
              and public.has_store_role(public.storage_store_id(name), 'editor'));

create policy "media_editor_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.storage_store_id(name) is not null
         and public.has_store_role(public.storage_store_id(name), 'editor'));
