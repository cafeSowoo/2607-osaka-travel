create table if not exists public.osaka_memos (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null,
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint osaka_memos_user_trip_fkey
    foreign key (user_id, trip_id)
    references public.osaka_trips (user_id, id)
    on delete cascade
);

create index if not exists osaka_memos_user_trip_updated_idx
  on public.osaka_memos (user_id, trip_id, updated_at desc);

alter table public.osaka_memos enable row level security;

grant select, insert, update, delete on public.osaka_memos to authenticated;

create policy "Users can manage their osaka memos"
  on public.osaka_memos for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
