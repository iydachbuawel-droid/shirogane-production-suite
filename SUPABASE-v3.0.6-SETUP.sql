-- SHIROGANE Production Suite v3.0.11 — Android ↔ PC image sync
-- Jalankan SEKALI di Supabase > SQL Editor.
-- Aman dijalankan ulang.

create table if not exists public.shirogane_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shirogane_app_state enable row level security;

drop policy if exists "shirogane_select_own" on public.shirogane_app_state;
drop policy if exists "shirogane_insert_own" on public.shirogane_app_state;
drop policy if exists "shirogane_update_own" on public.shirogane_app_state;
drop policy if exists "shirogane_delete_own" on public.shirogane_app_state;

create policy "shirogane_select_own" on public.shirogane_app_state
for select to authenticated using (auth.uid() = user_id);
create policy "shirogane_insert_own" on public.shirogane_app_state
for insert to authenticated with check (auth.uid() = user_id);
create policy "shirogane_update_own" on public.shirogane_app_state
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "shirogane_delete_own" on public.shirogane_app_state
for delete to authenticated using (auth.uid() = user_id);

create or replace function public.shirogane_touch_updated_at()
returns trigger language plpgsql security invoker as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shirogane_touch_state on public.shirogane_app_state;
create trigger shirogane_touch_state
before update on public.shirogane_app_state
for each row execute function public.shirogane_touch_updated_at();

-- Aktifkan Realtime hanya bila belum menjadi anggota publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shirogane_app_state'
  ) then
    alter publication supabase_realtime add table public.shirogane_app_state;
  end if;
end $$;

-- Storage gambar desain: PUBLIC URL untuk kompatibilitas Android ↔ PC.
-- File tetap memakai path UUID/user sehingga URL tidak mudah ditebak.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shirogane-images',
  'shirogane-images',
  true,
  5242880,
  array['image/webp','image/jpeg','image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shirogane_images_select_own" on storage.objects;
drop policy if exists "shirogane_images_insert_own" on storage.objects;
drop policy if exists "shirogane_images_update_own" on storage.objects;
drop policy if exists "shirogane_images_delete_own" on storage.objects;

create policy "shirogane_images_select_own" on storage.objects
for select to authenticated
using (bucket_id = 'shirogane-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "shirogane_images_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'shirogane-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "shirogane_images_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'shirogane-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'shirogane-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "shirogane_images_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'shirogane-images' and (storage.foldername(name))[1] = auth.uid()::text);
