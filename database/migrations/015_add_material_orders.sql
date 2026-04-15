begin;

create extension if not exists pgcrypto;

create table if not exists public.ess_material_orders (
  id uuid primary key default gen_random_uuid(),
  builder_id text,
  builder_name text not null,
  project_id text,
  project_name text not null,
  requested_by_user_id uuid,
  requested_by_name text not null,
  order_date date not null,
  notes text,
  item_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_material_orders_order_date_idx
  on public.ess_material_orders (order_date desc);

create index if not exists ess_material_orders_updated_at_idx
  on public.ess_material_orders (updated_at desc);

alter table public.ess_material_orders enable row level security;

drop policy if exists "material_orders_select_anon_auth" on public.ess_material_orders;
create policy "material_orders_select_anon_auth"
on public.ess_material_orders
for select
to anon, authenticated
using (true);

drop policy if exists "material_orders_insert_anon_auth" on public.ess_material_orders;
create policy "material_orders_insert_anon_auth"
on public.ess_material_orders
for insert
to anon, authenticated
with check (true);

drop policy if exists "material_orders_update_anon_auth" on public.ess_material_orders;
create policy "material_orders_update_anon_auth"
on public.ess_material_orders
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "material_orders_delete_anon_auth" on public.ess_material_orders;
create policy "material_orders_delete_anon_auth"
on public.ess_material_orders
for delete
to anon, authenticated
using (true);

commit;
