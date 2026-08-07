-- SHIROGANE v3.0.11 — FIX GAMBAR ANDROID -> PC
-- Jalankan sekali di Supabase > SQL Editor.

update storage.buckets
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/webp','image/jpeg','image/png']
where id = 'shirogane-images';

-- Jika bucket belum ada, buat.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shirogane-images','shirogane-images',true,5242880,array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
