alter table public.osaka_checklist_items
  add column if not exists kind text not null default 'task';

alter table public.osaka_checklist_items
  drop constraint if exists osaka_checklist_items_kind_check;

alter table public.osaka_checklist_items
  add constraint osaka_checklist_items_kind_check
  check (kind in ('task', 'divider'));
