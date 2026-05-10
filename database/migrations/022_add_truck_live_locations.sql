begin;

create table if not exists public.ess_truck_live_locations (
  truck_id text primary key,
  truck_label text not null default '',
  role_name text not null default '',
  driver_user_id text,
  delivery_request_id text,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  heading_deg double precision,
  speed_mps double precision,
  battery_percent double precision,
  status text not null default '',
  route_path jsonb not null default '[]'::jsonb,
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_truck_live_locations_recorded_at_idx
  on public.ess_truck_live_locations (recorded_at desc);

create index if not exists ess_truck_live_locations_driver_user_idx
  on public.ess_truck_live_locations (driver_user_id);

create or replace function public.touch_ess_truck_live_locations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_truck_live_locations_updated_at on public.ess_truck_live_locations;
create trigger trg_touch_ess_truck_live_locations_updated_at
before update on public.ess_truck_live_locations
for each row
execute function public.touch_ess_truck_live_locations_updated_at();

alter table public.ess_truck_live_locations enable row level security;

drop policy if exists "truck_live_locations_select_anon_auth" on public.ess_truck_live_locations;
create policy "truck_live_locations_select_anon_auth"
on public.ess_truck_live_locations
for select
to anon, authenticated
using (true);

drop policy if exists "truck_live_locations_insert_anon_auth" on public.ess_truck_live_locations;
create policy "truck_live_locations_insert_anon_auth"
on public.ess_truck_live_locations
for insert
to anon, authenticated
with check (truck_id in ('truck-1', 'truck-2', 'truck-3'));

drop policy if exists "truck_live_locations_update_anon_auth" on public.ess_truck_live_locations;
create policy "truck_live_locations_update_anon_auth"
on public.ess_truck_live_locations
for update
to anon, authenticated
using (truck_id in ('truck-1', 'truck-2', 'truck-3'))
with check (truck_id in ('truck-1', 'truck-2', 'truck-3'));

commit;
