begin;

alter table public.osaka_itinerary_items
  drop constraint if exists osaka_itinerary_items_trip_id_fkey;
alter table public.osaka_reservations
  drop constraint if exists osaka_reservations_trip_id_fkey;
alter table public.osaka_checklist_items
  drop constraint if exists osaka_checklist_items_trip_id_fkey;

alter table public.osaka_itinerary_items
  drop constraint if exists osaka_itinerary_items_pkey;
alter table public.osaka_reservations
  drop constraint if exists osaka_reservations_pkey;
alter table public.osaka_checklist_items
  drop constraint if exists osaka_checklist_items_pkey;
alter table public.osaka_trips
  drop constraint if exists osaka_trips_pkey;

alter table public.osaka_trips
  add primary key (user_id, id);
alter table public.osaka_itinerary_items
  add primary key (user_id, id);
alter table public.osaka_reservations
  add primary key (user_id, id);
alter table public.osaka_checklist_items
  add primary key (user_id, id);

alter table public.osaka_itinerary_items
  add constraint osaka_itinerary_items_user_trip_fkey
  foreign key (user_id, trip_id)
  references public.osaka_trips (user_id, id)
  on delete cascade;
alter table public.osaka_reservations
  add constraint osaka_reservations_user_trip_fkey
  foreign key (user_id, trip_id)
  references public.osaka_trips (user_id, id)
  on delete cascade;
alter table public.osaka_checklist_items
  add constraint osaka_checklist_items_user_trip_fkey
  foreign key (user_id, trip_id)
  references public.osaka_trips (user_id, id)
  on delete cascade;

commit;
