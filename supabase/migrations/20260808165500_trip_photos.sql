create table if not exists public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  storage_path text unique not null check (storage_path like 'fab-five-2026-08-08/%'),
  caption text check (caption is null or char_length(caption) between 1 and 240),
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.trip_photos enable row level security;

grant select, insert, delete on public.trip_photos to anon;

drop policy if exists "Public trip photos are readable" on public.trip_photos;
create policy "Public trip photos are readable"
on public.trip_photos for select to anon using (true);

drop policy if exists "Public trip photos are insertable" on public.trip_photos;
create policy "Public trip photos are insertable"
on public.trip_photos for insert to anon with check (true);

drop policy if exists "Public trip photos are deletable" on public.trip_photos;
create policy "Public trip photos are deletable"
on public.trip_photos for delete to anon using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-photos',
  'trip-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public active trip photos are readable" on storage.objects;
create policy "Public active trip photos are readable"
on storage.objects for select to anon
using (
  bucket_id = 'trip-photos'
  and (storage.foldername(name))[1] = 'fab-five-2026-08-08'
);

drop policy if exists "Public active trip photos are insertable" on storage.objects;
create policy "Public active trip photos are insertable"
on storage.objects for insert to anon
with check (
  bucket_id = 'trip-photos'
  and (storage.foldername(name))[1] = 'fab-five-2026-08-08'
);

drop policy if exists "Public active trip photos are deletable" on storage.objects;
create policy "Public active trip photos are deletable"
on storage.objects for delete to anon
using (
  bucket_id = 'trip-photos'
  and (storage.foldername(name))[1] = 'fab-five-2026-08-08'
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_photos'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_photos';
  end if;
end;
$$;
