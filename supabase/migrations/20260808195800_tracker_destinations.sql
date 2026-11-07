alter table public.trip_state
  drop constraint if exists trip_state_active_destination_check;

alter table public.trip_state
  add constraint trip_state_active_destination_check
  check (
    active_destination in (
      'Manasquan Inlet',
      'Barnegat Ridge South',
      'Barnegat Ridge North',
      'Seaside Lumps',
      'Monster Ledge',
      'Home'
    )
  );
