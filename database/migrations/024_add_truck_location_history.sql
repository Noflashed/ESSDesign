begin;

create table if not exists public.ess_truck_location_history (
  id uuid primary key default gen_random_uuid(),
  client_point_id text not null,
  truck_id text not null,
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
  tracking_state text not null default '',
  motion_state text not null default '',
  recorded_at timestamptz not null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists ess_truck_location_history_client_point_uidx
  on public.ess_truck_location_history (truck_id, client_point_id);

create index if not exists ess_truck_location_history_truck_recorded_idx
  on public.ess_truck_location_history (truck_id, recorded_at asc);

create index if not exists ess_truck_location_history_label_recorded_idx
  on public.ess_truck_location_history (truck_label, recorded_at asc);

create index if not exists ess_truck_location_history_driver_idx
  on public.ess_truck_location_history (driver_user_id, recorded_at desc);

create index if not exists ess_truck_location_history_delivery_idx
  on public.ess_truck_location_history (delivery_request_id, recorded_at asc)
  where delivery_request_id is not null;

alter table public.ess_truck_location_history enable row level security;

drop policy if exists "truck_location_history_select_anon_auth" on public.ess_truck_location_history;
create policy "truck_location_history_select_anon_auth"
on public.ess_truck_location_history
for select
to anon, authenticated
using (true);

drop policy if exists "truck_location_history_insert_anon_auth" on public.ess_truck_location_history;
create policy "truck_location_history_insert_anon_auth"
on public.ess_truck_location_history
for insert
to anon, authenticated
with check (truck_id in ('truck-1', 'truck-2', 'truck-3'));

drop policy if exists "truck_location_history_update_anon_auth" on public.ess_truck_location_history;
create policy "truck_location_history_update_anon_auth"
on public.ess_truck_location_history
for update
to anon, authenticated
using (truck_id in ('truck-1', 'truck-2', 'truck-3'))
with check (truck_id in ('truck-1', 'truck-2', 'truck-3'));

notify pgrst, 'reload schema';

commit;
