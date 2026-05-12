begin;

create table if not exists public.ess_transport_reverse_geocodes (
  coordinate_key text primary key,
  latitude double precision not null,
  longitude double precision not null,
  label text not null default '',
  address text not null default '',
  street text not null default '',
  suburb text not null default '',
  municipality text not null default '',
  state text not null default '',
  postcode text not null default '',
  provider text not null default '',
  last_refreshed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_transport_reverse_geocodes_suburb_idx
  on public.ess_transport_reverse_geocodes (suburb);

create index if not exists ess_transport_reverse_geocodes_updated_idx
  on public.ess_transport_reverse_geocodes (updated_at desc);

create or replace function public.touch_ess_transport_reverse_geocodes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_transport_reverse_geocodes_updated_at on public.ess_transport_reverse_geocodes;
create trigger trg_touch_ess_transport_reverse_geocodes_updated_at
before update on public.ess_transport_reverse_geocodes
for each row
execute function public.touch_ess_transport_reverse_geocodes_updated_at();

alter table public.ess_transport_reverse_geocodes enable row level security;

drop policy if exists "transport_reverse_geocodes_select_anon_auth" on public.ess_transport_reverse_geocodes;
create policy "transport_reverse_geocodes_select_anon_auth"
on public.ess_transport_reverse_geocodes
for select
to anon, authenticated
using (true);

notify pgrst, 'reload schema';

commit;
