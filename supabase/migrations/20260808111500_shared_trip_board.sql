create extension if not exists pgcrypto;

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
  active_destination text not null check (active_destination in ('Manasquan Inlet', 'Barnegat Ridge South', 'Barnegat Ridge North', 'Seaside Lumps', 'Home')),
  return_note text not null check (char_length(return_note) between 1 and 160),
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

alter table public.trips enable row level security;
alter table public.trip_state enable row level security;
alter table public.trip_log_entries enable row level security;

grant usage on schema public to anon;
grant select on public.trips to anon;
grant select, insert, update, delete on public.trip_state to anon;
grant select, insert, update, delete on public.trip_log_entries to anon;

drop policy if exists "Public trips are readable" on public.trips;
create policy "Public trips are readable"
on public.trips for select to anon using (true);

drop policy if exists "Public trip state is collaborative" on public.trip_state;
create policy "Public trip state is collaborative"
on public.trip_state for all to anon using (true) with check (true);

drop policy if exists "Public trip logs are collaborative" on public.trip_log_entries;
create policy "Public trip logs are collaborative"
on public.trip_log_entries for all to anon using (true) with check (true);

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
end;
$$;

insert into public.trips (id, slug, title, trip_date, created_at)
values (
  'fabe5000-0000-4000-8000-000000000001',
  'fab-five-2026-08-08',
  'The Fab Five',
  '2026-08-08',
  '2026-08-08T09:15:00Z'
)
on conflict (id) do nothing;

insert into public.trip_state (trip_id, status, active_destination, return_note, updated_at)
values (
  'fabe5000-0000-4000-8000-000000000001',
  'underway',
  'Barnegat Ridge South',
  'Late afternoon, exact time TBD',
  '2026-08-08T10:00:00Z'
)
on conflict (trip_id) do nothing;

insert into public.trip_log_entries
  (id, trip_id, time_label, entry_type, method, angler, moment, created_at, updated_at)
values
  ('fabe5000-0000-4000-8000-000000000101', 'fabe5000-0000-4000-8000-000000000001', 'Aug 8, 5:15 AM', 'Plan', 'Running', null, 'Planned departure from Manorside. John, Bill, Pete, Phil, and Will aboard.', '2026-08-08T09:15:00Z', '2026-08-08T09:15:00Z'),
  ('fabe5000-0000-4000-8000-000000000102', 'fabe5000-0000-4000-8000-000000000001', 'Aug 8, 5:30 AM', 'Plan', 'Running', null, 'Target the Jordan Road bridge opening, then head for Manasquan Inlet and clear the inlet before turning toward the grounds.', '2026-08-08T09:30:00Z', '2026-08-08T09:30:00Z'),
  ('fabe5000-0000-4000-8000-000000000103', 'fabe5000-0000-4000-8000-000000000001', 'Aug 8, fishing plan', 'Plan', 'Other', null, 'Work Barnegat Ridge South, slide to Ridge North, then finish at Seaside Lumps. Life and onboard marks beat the itinerary.', '2026-08-08T09:31:00Z', '2026-08-08T09:31:00Z'),
  ('fabe5000-0000-4000-8000-000000000104', 'fabe5000-0000-4000-8000-000000000001', 'Aug 8, before lines in', 'Plan', 'Other', null, 'Recheck NOAA bluefin status and marine forecast. Official catches go on John''s Waterpoof app first; NOAA reporting follows any landed bluefin or dead discard.', '2026-08-08T09:32:00Z', '2026-08-08T09:32:00Z'),
  ('fabe5000-0000-4000-8000-000000000105', 'fabe5000-0000-4000-8000-000000000001', 'Aug 8, 6:00 AM', 'Boat life', 'Running', null, 'Reached Manasquan Inlet and started heading toward Barnegat Ridge South.', '2026-08-08T10:00:00Z', '2026-08-08T10:00:00Z')
on conflict (id) do nothing;
