alter table public.osaka_itinerary_items
  add column if not exists confirmed boolean not null default false;
