alter table public.osaka_itinerary_items
  add column if not exists google_place_id text not null default '',
  add column if not exists google_maps_uri text not null default '',
  add column if not exists formatted_address text not null default '',
  add column if not exists lat numeric(10, 7),
  add column if not exists lng numeric(10, 7);

create index if not exists osaka_itinerary_items_google_place_id_idx
  on public.osaka_itinerary_items(user_id, google_place_id)
  where google_place_id <> '';
