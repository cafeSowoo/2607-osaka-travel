alter table public.osaka_checklist_items
  add column if not exists list_type text not null default 'todo',
  add column if not exists packing_category text;

alter table public.osaka_checklist_items
  drop constraint if exists osaka_checklist_items_list_type_check;

alter table public.osaka_checklist_items
  add constraint osaka_checklist_items_list_type_check
  check (list_type in ('todo', 'packing'));

alter table public.osaka_checklist_items
  drop constraint if exists osaka_checklist_items_packing_category_check;

alter table public.osaka_checklist_items
  add constraint osaka_checklist_items_packing_category_check
  check (
    packing_category is null
    or packing_category in ('필수품', '의류', '전자기기', '세면용품', '의약품', '기타')
  );

create index if not exists osaka_checklist_items_group_idx
  on public.osaka_checklist_items (
    user_id,
    trip_id,
    list_type,
    packing_category,
    sort_order
  );
