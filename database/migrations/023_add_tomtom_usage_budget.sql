begin;

alter table public.ess_transport_route_estimates
  add column if not exists last_requested_at timestamptz,
  add column if not exists request_count integer not null default 0;

create index if not exists ess_transport_route_estimates_last_requested_idx
  on public.ess_transport_route_estimates (last_requested_at desc);

create table if not exists public.ess_tomtom_api_usage (
  id uuid primary key default gen_random_uuid(),
  usage_date date not null,
  category text not null default 'unknown',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_tomtom_api_usage_date_idx
  on public.ess_tomtom_api_usage (usage_date, created_at desc);

create index if not exists ess_tomtom_api_usage_category_idx
  on public.ess_tomtom_api_usage (category, usage_date);

alter table public.ess_tomtom_api_usage enable row level security;

notify pgrst, 'reload schema';

commit;
