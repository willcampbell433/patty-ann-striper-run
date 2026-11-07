alter table public.trip_state
  drop constraint if exists trip_state_return_note_check;

alter table public.trip_state
  add constraint trip_state_return_note_check
  check (char_length(return_note) between 1 and 500);
