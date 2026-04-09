begin;

create extension if not exists pgcrypto;

create table if not exists public.ess_leading_hand_relationships (
  id uuid primary key default gen_random_uuid(),
  leading_hand_employee_id uuid not null references public.ess_rostering_employees(id) on delete cascade,
  employee_id uuid not null references public.ess_rostering_employees(id) on delete cascade,
  relationship_type text not null default 'neutral',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ess_leading_hand_relationships_type_check check (relationship_type in ('good', 'bad', 'neutral')),
  constraint ess_leading_hand_relationships_self_check check (leading_hand_employee_id <> employee_id)
);

create unique index if not exists ess_leading_hand_relationships_pair_idx
  on public.ess_leading_hand_relationships (leading_hand_employee_id, employee_id);

create index if not exists ess_leading_hand_relationships_lookup_idx
  on public.ess_leading_hand_relationships (leading_hand_employee_id, relationship_type);

alter table public.ess_leading_hand_relationships enable row level security;

drop policy if exists "leading_hand_relationships_select_anon_auth" on public.ess_leading_hand_relationships;
create policy "leading_hand_relationships_select_anon_auth"
on public.ess_leading_hand_relationships
for select
to anon, authenticated
using (true);

drop policy if exists "leading_hand_relationships_insert_anon_auth" on public.ess_leading_hand_relationships;
create policy "leading_hand_relationships_insert_anon_auth"
on public.ess_leading_hand_relationships
for insert
to anon, authenticated
with check (true);

drop policy if exists "leading_hand_relationships_update_anon_auth" on public.ess_leading_hand_relationships;
create policy "leading_hand_relationships_update_anon_auth"
on public.ess_leading_hand_relationships
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "leading_hand_relationships_delete_anon_auth" on public.ess_leading_hand_relationships;
create policy "leading_hand_relationships_delete_anon_auth"
on public.ess_leading_hand_relationships
for delete
to anon, authenticated
using (true);

commit;
