alter table public.osaka_itinerary_items
  drop constraint if exists osaka_itinerary_items_day_index_check;

alter table public.osaka_itinerary_items
  add constraint osaka_itinerary_items_day_index_check check (day_index between 1 and 6);
