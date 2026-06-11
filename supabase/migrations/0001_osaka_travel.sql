create extension if not exists pgcrypto;

create table if not exists public.trips (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  exchange_rate numeric(10, 3) not null default 9.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null references public.trips(id) on delete cascade,
  day_index int not null check (day_index between 1 and 5),
  date date not null,
  start_time text,
  end_time text,
  place text not null default '',
  category text not null check (category in ('이동', '식사', '카페', '관광', '쇼핑', '휴식', '기타')),
  title text not null default '',
  note text not null default '',
  budget_jpy numeric(12, 2) not null default 0,
  google_place_query text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('flight', 'hotel')),
  title text not null,
  reference text not null,
  primary_date date not null,
  subtitle text not null default '',
  details jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null references public.trips(id) on delete cascade,
  section text not null check (section in ('출국 전', '여행 중', '귀국 전')),
  title text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists itinerary_items_user_trip_day_idx on public.itinerary_items(user_id, trip_id, day_index, sort_order);
create index if not exists reservations_user_trip_idx on public.reservations(user_id, trip_id, sort_order);
create index if not exists checklist_items_user_trip_idx on public.checklist_items(user_id, trip_id, sort_order);

alter table public.trips enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.reservations enable row level security;
alter table public.checklist_items enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.itinerary_items to authenticated;
grant select, insert, update, delete on public.reservations to authenticated;
grant select, insert, update, delete on public.checklist_items to authenticated;

create policy "Users can manage their trips"
  on public.trips for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their itinerary items"
  on public.itinerary_items for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their reservations"
  on public.reservations for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage their checklist items"
  on public.checklist_items for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
