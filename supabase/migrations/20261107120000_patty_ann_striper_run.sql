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
  'Nine bass by 11:45 and every man on the board. Dennis 3, Bruce 2, Will 1, Tom 1, Jon 1, Don 1. Three inside the slot, six too big. Still hitting it.',
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
    'a7770000-0000-4000-8000-00000000011c',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 6:45 AM',
    'Boat life',
    'Other',
    null,
    'Tom goes down early. Feeling the seas before lines were even wet, so he found a spot in the cabin and slept. Five hours, straight through the whole westbound grind.',
    '2026-11-07T05:03:30Z',
    '2026-11-07T05:03:30Z'
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
    'Turned around and running back east, on word of mouth. Pete, Don''s cousin, out in his own center console Robalo, had been texting Bruce at Long Beach to say the fish were where he was. Greg was getting the same thing by phone from his own buddies: the bass are back east, outside Fire Island Inlet. The whole fleet hurried back there at once. Bruce and Don fish with Pete, who goes by Louie, often enough that the standing joke is he outfishes the two of them combined. He was right again.',
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
    'Ran the whole way back east and set up in the ocean just outside Fire Island Inlet. Boats everywhere. Found where everyone is.',
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
  ),
  (
    'a7770000-0000-4000-8000-00000000010d',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, next run',
    'Mark',
    'Running',
    null,
    'Another run through the same water outside the inlet, and this one was massive. Four more bass in the boat.',
    '2026-11-07T05:12:00Z',
    '2026-11-07T05:12:00Z'
  ),
  (
    'a7770000-0000-4000-8000-00000000010e',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, next run',
    'Striped bass',
    'Trolling',
    'Dennis',
    'Dennis right back on the board. Second bass of the day for a guy who had never caught one before today.',
    '2026-11-07T05:13:00Z',
    '2026-11-07T05:13:00Z'
  ),
  (
    'a7770000-0000-4000-8000-00000000010f',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, next run',
    'Striped bass',
    'Trolling',
    'Dennis',
    'And again. Three for Dennis, high hook on the Patty Ann.',
    '2026-11-07T05:14:00Z',
    '2026-11-07T05:14:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000110',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, next run',
    'Striped bass',
    'Trolling',
    'Jon',
    'Jon gets his, and it is the first striped bass of his life too. Two men on this boat caught their first one inside the same hour.',
    '2026-11-07T05:15:00Z',
    '2026-11-07T05:15:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000111',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, next run',
    'Striped bass',
    'Trolling',
    'Bruce',
    'Bruce adds his second of the day. Boat total is six bass, two of them inside the slot and the rest too big to keep.',
    '2026-11-07T05:16:00Z',
    '2026-11-07T05:16:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000112',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, next run',
    'Boat life',
    'Other',
    null,
    'Cameras out for this one. Finally some fish worth photographing.',
    '2026-11-07T05:17:00Z',
    '2026-11-07T05:17:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000113',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 11:45 AM',
    'Mark',
    'Trolling',
    null,
    'Pulled over the same spot a couple more times and it kept producing. The spoons were absolutely hitting. Three more bass, and that puts every single guy on the boat on the board.',
    '2026-11-07T05:18:00Z',
    '2026-11-07T05:18:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000114',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 11:45 AM',
    'Striped bass',
    'Trolling',
    'Will',
    'Will finally gets his, on the last pass. Over the slot, so it goes back. (33")',
    '2026-11-07T05:19:00Z',
    '2026-11-07T05:19:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000115',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 11:45 AM',
    'Striped bass',
    'Trolling',
    'Tom',
    'Tom wakes up, picks up a rod, and hooks a cow almost immediately. Biggest fish of the day, well over the slot, released. Five hours asleep and he did not miss a thing, because every fish came in the last forty-five minutes. (36 to 37")',
    '2026-11-07T05:20:00Z',
    '2026-11-07T05:20:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000116',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 11:45 AM',
    'Striped bass',
    'Trolling',
    'Don',
    'Don puts the last man on the board. Nine bass aboard and nobody skunked.',
    '2026-11-07T05:21:00Z',
    '2026-11-07T05:21:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000117',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 11:55 AM',
    'Mark',
    'Running',
    null,
    'Called it at 11:55. Last pictures taken, lines in, and the Patty Ann is headed back through the inlet. If Greg sees anything on the way home he will stop on it, but the day is done. Three keepers in the box, all inside the slot, and every man aboard caught a fish.',
    '2026-11-07T05:22:00Z',
    '2026-11-07T05:22:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000118',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 11:55 AM',
    'Boat life',
    'Other',
    null,
    'Hats off to Greg and AJ for sticking it out. They had no afternoon trip, kept working almost an hour past the booked dock time, and stayed on the fish right to the end. Nobody is complaining.',
    '2026-11-07T05:23:00Z',
    '2026-11-07T05:23:00Z'
  ),
  (
    'a7770000-0000-4000-8000-000000000119',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, the ride in',
    'Quote',
    'Trolling',
    null,
    'Bruce''s read on the day: the bass wanted the flutter spoon. They like the jewelry, and the jewelry ended up catching all the fish.',
    '2026-11-07T05:24:00Z',
    '2026-11-07T05:24:00Z'
  ),
  (
    'a7770000-0000-4000-8000-00000000011a',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, the ride in',
    'Quote',
    'Other',
    null,
    'Mr. Excitement accepts the title. Dennis, high hook with three: "As we say on the soccer field, it''s excitement time."',
    '2026-11-07T05:25:00Z',
    '2026-11-07T05:25:00Z'
  ),
  (
    'a7770000-0000-4000-8000-00000000011b',
    'a7770000-0000-4000-8000-000000000001',
    'Nov 7, 12:30 PM',
    'Boat life',
    'Dockside',
    null,
    'Back at the dock at 12:30, an hour and a half past the booked 11:00 return. Fish cleaned and split, and everybody drove home with a bag. Six hours and thirty minutes, nine bass, three keepers in the slot, every man on the board. Everyone is happy. That is the whole trip.',
    '2026-11-07T05:26:00Z',
    '2026-11-07T05:26:00Z'
  )
on conflict (id) do nothing;
