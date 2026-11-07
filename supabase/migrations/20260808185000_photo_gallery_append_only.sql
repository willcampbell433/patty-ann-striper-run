revoke delete on public.trip_photos from anon;

drop policy if exists "Public trip photos are deletable" on public.trip_photos;
drop policy if exists "Public active trip photos are deletable" on storage.objects;
