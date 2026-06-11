create index if not exists osaka_itinerary_items_trip_idx on public.osaka_itinerary_items(trip_id);
create index if not exists osaka_reservations_trip_idx on public.osaka_reservations(trip_id);
create index if not exists osaka_checklist_items_trip_idx on public.osaka_checklist_items(trip_id);
create index if not exists osaka_trips_user_idx on public.osaka_trips(user_id);

drop policy if exists "Users can manage their osaka trips" on public.osaka_trips;
drop policy if exists "Users can manage their osaka itinerary items" on public.osaka_itinerary_items;
drop policy if exists "Users can manage their osaka reservations" on public.osaka_reservations;
drop policy if exists "Users can manage their osaka checklist items" on public.osaka_checklist_items;

create policy "Users can manage their osaka trips"
  on public.osaka_trips for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can manage their osaka itinerary items"
  on public.osaka_itinerary_items for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can manage their osaka reservations"
  on public.osaka_reservations for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can manage their osaka checklist items"
  on public.osaka_checklist_items for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
