begin;

create table if not exists public.ess_material_order_requests (
  id text primary key,
  source_order_id text,
  connected_parent_start_minutes integer,
  connected_parent_segment text check (connected_parent_segment is null or connected_parent_segment in ('primary', 'return')),
  route_type text,
  builder_id text,
  builder_name text not null default '',
  project_id text,
  project_name text not null default '',
  requested_by_user_id text,
  requested_by_name text not null default '',
  order_date date,
  submitted_at timestamptz not null default timezone('utc', now()),
  notes text not null default '',
  item_values jsonb not null default '{}'::jsonb,
  pdf_path text not null default '',
  scaffolding_system text not null default '',
  details text not null default '',
  scheduled_date date,
  scheduled_hour integer check (scheduled_hour is null or (scheduled_hour >= 0 and scheduled_hour <= 23)),
  scheduled_minute integer check (scheduled_minute is null or (scheduled_minute >= 0 and scheduled_minute <= 59)),
  scheduled_at_iso text,
  scheduled_truck_id text,
  scheduled_truck_label text,
  truck_id text,
  truck_label text,
  delivery_status text,
  delivery_started_at timestamptz,
  delivery_unloading_at timestamptz,
  delivery_confirmed_at timestamptz,
  archived_at timestamptz,
  schedule_removed_at timestamptz,
  secondary_route jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_material_order_requests_submitted_at_idx
  on public.ess_material_order_requests (submitted_at desc);

create index if not exists ess_material_order_requests_scheduled_date_idx
  on public.ess_material_order_requests (scheduled_date);

create index if not exists ess_material_order_requests_archived_at_idx
  on public.ess_material_order_requests (archived_at);

create index if not exists ess_material_order_requests_source_order_id_idx
  on public.ess_material_order_requests (source_order_id);

create index if not exists ess_material_order_requests_route_type_idx
  on public.ess_material_order_requests (route_type);

create or replace function public.touch_ess_material_order_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_material_order_requests_updated_at on public.ess_material_order_requests;
create trigger trg_touch_ess_material_order_requests_updated_at
before update on public.ess_material_order_requests
for each row
execute function public.touch_ess_material_order_requests_updated_at();

alter table public.ess_material_order_requests enable row level security;

drop policy if exists "material_order_requests_select_anon_auth" on public.ess_material_order_requests;
create policy "material_order_requests_select_anon_auth"
on public.ess_material_order_requests
for select
to anon, authenticated
using (true);

drop policy if exists "material_order_requests_insert_anon_auth" on public.ess_material_order_requests;
create policy "material_order_requests_insert_anon_auth"
on public.ess_material_order_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "material_order_requests_update_anon_auth" on public.ess_material_order_requests;
create policy "material_order_requests_update_anon_auth"
on public.ess_material_order_requests
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "material_order_requests_delete_anon_auth" on public.ess_material_order_requests;
create policy "material_order_requests_delete_anon_auth"
on public.ess_material_order_requests
for delete
to anon, authenticated
using (true);

commit;
