begin;

create table if not exists public.ess_transport_route_estimates (
  route_key text primary key,
  segment text not null default 'primary',
  from_location text not null default '',
  to_location text not null default '',
  scheduled_date date,
  scheduled_hour integer check (scheduled_hour is null or (scheduled_hour >= 0 and scheduled_hour <= 23)),
  scheduled_minute integer check (scheduled_minute is null or (scheduled_minute >= 0 and scheduled_minute <= 59)),
  enable_tolls boolean not null default false,
  route_data jsonb not null default '{}'::jsonb,
  distance_meters double precision not null default 0,
  base_duration_seconds double precision not null default 0,
  duration_seconds double precision not null default 0,
  traffic_delay_seconds double precision not null default 0,
  has_live_traffic boolean not null default false,
  traffic_provider text not null default '',
  traffic_note text not null default '',
  last_refreshed_at timestamptz,
  expires_at timestamptz,
  active_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_transport_route_estimates_expires_at_idx
  on public.ess_transport_route_estimates (expires_at);

create index if not exists ess_transport_route_estimates_active_until_idx
  on public.ess_transport_route_estimates (active_until);

create index if not exists ess_transport_route_estimates_schedule_idx
  on public.ess_transport_route_estimates (scheduled_date, scheduled_hour, scheduled_minute);

create or replace function public.touch_ess_transport_route_estimates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_transport_route_estimates_updated_at on public.ess_transport_route_estimates;
create trigger trg_touch_ess_transport_route_estimates_updated_at
before update on public.ess_transport_route_estimates
for each row
execute function public.touch_ess_transport_route_estimates_updated_at();

alter table public.ess_transport_route_estimates enable row level security;

drop policy if exists "transport_route_estimates_select_anon_auth" on public.ess_transport_route_estimates;
create policy "transport_route_estimates_select_anon_auth"
on public.ess_transport_route_estimates
for select
to anon, authenticated
using (true);

commit;
