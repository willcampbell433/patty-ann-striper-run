-- Patty Ann striper run, November 7 2026.
--
-- This migration is additive and reuses the shared trip board schema created for
-- the Ofishal Business trips. It adds the Patty Ann trip, its state, its seed log
-- entries, the destinations it uses, and its storage-path policies. It does not
-- touch any existing trip's rows.

create extension if not exists pgcrypto;

/* ---------- Schema, created only if this is a fresh project ---------- */

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (char_length(slug) between 1 and 80),
  title text not null check (char_length(title) between 1 and 120),
  trip_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_state (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  status text not null check (status in ('pre-departure', 'underway', 'fishing', 'heading-home', 'recap')),
  active_destination text not null,
  return_note text not null check (char_length(return_note) between 1 and 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_log_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  time_label text not null check (char_length(time_label) between 1 and 80),
  entry_type text not null check (char_length(entry_type) between 1 and 40),
  method text not null check (char_length(method) between 1 and 40),
  angler text check (angler is null or char_length(angler) between 1 and 40),
  moment text not null check (char_length(moment) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  storage_path text unique not null,
  caption text check (caption is null or char_length(caption) between 1 and 240),
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trip_state_updated_at on public.trip_state;
create trigger set_trip_state_updated_at
before update on public.trip_state
for each row execute function public.set_updated_at();

drop trigger if exists set_trip_log_entries_updated_at on public.trip_log_entries;
create trigger set_trip_log_entries_updated_at
before update on public.trip_log_entries
for each row execute function public.set_updated_at();

/* ---------- Destinations ---------- */

-- The storage_path constraint was trip-specific in the original project. Relax it
-- to a generic shape so each trip's slug folder is valid, and keep the traversal
-- guard that actually matters.
alter table public.trip_photos
  drop constraint if exists trip_photos_storage_path_check;

alter table public.trip_photos
  add constraint trip_photos_storage_path_check
  check (
    storage_path ~ '^[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f-]+\.jpg$'
    and storage_path not like '%..%'
  );

-- Allow the Patty Ann destinations alongside any previously allowed values.
alter table public.trip_state
  drop constraint if exists trip_state_active_destination_check;

alter table public.trip_state
  add constraint trip_state_active_destination_check
  check (
    active_destination in (
      -- Patty Ann, Nov 7 2026
      'Long Beach',
      'Jones Inlet',
      'Jones Beach',
      'Gilgo beachfront',
      'Fire Island Inlet',
      'Democrat Point',
      'Lighthouse beachfront',
      'Fire Island Reef',
      'Home',
      -- Ofishal Business, Aug 8 2026
      'Manasquan Inlet',
      'Barnegat Ridge South',
      'Barnegat Ridge North',
      'Seaside Lumps',
      'Monster Ledge'
    )
  );

/* ---------- Row level security ---------- */

alter table public.trips enable row level security;
alter table public.trip_state enable row level security;
alter table public.trip_log_entries enable row level security;
alter table public.trip_photos enable row level security;

grant usage on schema public to anon;
grant select on public.trips to anon;
grant select, insert, update, delete on public.trip_state to anon;
grant select, insert, update, delete on public.trip_log_entries to anon;
grant select, insert on public.trip_photos to anon;

-- Photos stay append-only for public visitors: no delete grant, no delete policy.
revoke delete on public.trip_photos from anon;

drop policy if exists "Public trips are readable" on public.trips;
create policy "Public trips are readable"
on public.trips for select to anon using (true);

drop policy if exists "Public trip state is collaborative" on public.trip_state;
create policy "Public trip state is collaborative"
on public.trip_state for all to anon using (true) with check (true);

drop policy if exists "Public trip logs are collaborative" on public.trip_log_entries;
create policy "Public trip logs are collaborative"
on public.trip_log_entries for all to anon using (true) with check (true);

drop policy if exists "Public trip photos are readable" on public.trip_photos;
create policy "Public trip photos are readable"
on public.trip_photos for select to anon using (true);

drop policy if exists "Public trip photos are insertable" on public.trip_photos;
create policy "Public trip photos are insertable"
on public.trip_photos for insert to anon with check (true);

drop policy if exists "Public trip photos are deletable" on public.trip_photos;

/* ---------- Storage ---------- */

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

drop policy if exists "Public patty ann photos are readable" on storage.objects;
create policy "Public patty ann photos are readable"
on storage.objects for select to anon
using (
  bucket_id = 'trip-photos'
  and (storage.foldername(name))[1] = 'patty-ann-2026-11-07'
);

drop policy if exists "Public patty ann photos are insertable" on storage.objects;
create policy "Public patty ann photos are insertable"
on storage.objects for insert to anon
with check (
  bucket_id = 'trip-photos'
  and (storage.foldername(name))[1] = 'patty-ann-2026-11-07'
);

/* ---------- Realtime ---------- */

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_state'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_state';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_log_entries'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_log_entries';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_photos'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_photos';
  end if;
end;
$$;

/* ---------- Seed the Patty Ann trip ---------- */

insert into public.trips (id, slug, title, trip_date, created_at)
values (
  'a7770000-0000-4000-8000-000000000001',
  'patty-ann-2026-11-07',
  'The Patty Ann',
  '2026-11-07',
  '2026-11-07T05:00:00Z'
)
on conflict (id) do nothing;

insert into public.trip_state (trip_id, status, active_destination, return_note, updated_at)
values (
  'a7770000-0000-4000-8000-000000000001',
  'fishing',
  'Home',
  'Two stripers outside Democrat Point: Bruce 30" in the slot at 11:00 AM, Dennis 36" released at 11:20 AM.',
  '2026-11-07T05:00:00Z'
)
on conflict (trip_id) do nothing;

insert into public.trip_log_entries
  (id, trip_id, time_label, entry_type, method, angler, moment, created_at, updated_at)
values
  (
    'a7770000-0000-4000-8000-000000000101',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, dock',
    'Boat life',
    'Dockside',
    null,
    'Six aboard the Patty Ann at Captree: Bruce, Will, Tom, Dennis, Jon, and Don. Capt. Greg running it, AJ on the deck.',
    '2026-11-07T05:00:00Z',
    '2026-11-07T05:00:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000102',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, plan',
    'Boat life',
    'Running',
    null,
    'Out Fire Island Inlet and west along the ocean beachfront. Fall run, so the bait decides where we stop.',
    '2026-11-07T05:01:00Z',
    '2026-11-07T05:01:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000103',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, before lines in',
    'Boat life',
    'Other',
    null,
    'Striped bass: 28 to under 31 inch slot, one fish per person, inline circle hooks when fishing bait. Everything else goes back.',
    '2026-11-07T05:02:00Z',
    '2026-11-07T05:02:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000104',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 6:30 AM',
    'Mark',
    'Jigging',
    null,
    'First drop of the day off Democrat Point. Birds diving over the rips but nothing underneath them. Pulled up after 15 minutes and ran the beachfront west.',
    '2026-11-07T05:03:00Z',
    '2026-11-07T05:03:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000105',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 7:30 AM',
    'Mark',
    'Running',
    null,
    'Passed Jones Beach about half a mile off the sand, heading west down the beachfront.',
    '2026-11-07T05:04:00Z',
    '2026-11-07T05:04:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000106',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 7:38 AM',
    'Mark',
    'Running',
    null,
    'Off Jones Inlet between Point Lookout and the Jones Beach west end, still running west. About 15 nm from Captree with an 11:00 AM return.',
    '2026-11-07T05:05:00Z',
    '2026-11-07T05:05:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000107',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, ~8:20 AM',
    'Mark',
    'Jigging',
    null,
    'Second stop, off Long Beach. Rods down 20 to 30 minutes with no hits on the jigs, but the bunker were thick and we snagged five or six live ones.',
    '2026-11-07T05:06:00Z',
    '2026-11-07T05:06:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000108',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, ~8:40 AM',
    'Boat life',
    'Live bait',
    null,
    'Three live bunker in the water. Couple of dogfish bites and nothing else, so the bass are not under this bait.',
    '2026-11-07T05:07:00Z',
    '2026-11-07T05:07:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000109',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 8:52 AM',
    'Mark',
    'Running',
    null,
    'Turned around and running back east. Greg says a buddy of his put fish together back where we started, so we are retracing the morning with live bunker aboard.',
    '2026-11-07T05:08:00Z',
    '2026-11-07T05:08:00Z'
  ),
  (
    'a7770000-0000-4000-8000-00000000010a',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, back east',
    'Mark',
    'Running',
    null,
    'Ran the whole way back east and set up just outside Democrat Point, ocean side of the inlet. Boats everywhere. Found where everyone is.',
    '2026-11-07T05:09:00Z',
    '2026-11-07T05:09:00Z'
  ),
  (
    'a7770000-0000-4000-8000-00000000010b',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 11:00 AM',
    'Striped bass',
    'Trolling',
    'Bruce',
    'First fish in the boat. Bruce on the bunker spoon, and it measured right inside the slot. (30")',
    '2026-11-07T05:10:00Z',
    '2026-11-07T05:10:00Z'
  ),
  (
    'a7770000-0000-4000-8000-00000000010c',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 11:20 AM',
    'Striped bass',
    'Trolling',
    'Dennis',
    'Dennis on the board twenty minutes later, and it is the first striped bass of his life. Too big for the slot so it went back, but it fought him the whole way. (36")',
    '2026-11-07T05:11:00Z',
    '2026-11-07T05:11:00Z'
  )
on conflict (id) do nothing;
