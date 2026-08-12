-- Concurrency-safe, company-wide reference numbering for iOS Scaff-tags.
-- Existing Scaff-tags historically stored their scaffold name in
-- reference_number, so only matching five-digit values stored in both the
-- payload and relational reference seed this allocator.

begin;

create table if not exists public.ess_scaff_tag_counters (
  builder_id text not null,
  project_id text not null,
  last_value integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (builder_id, project_id)
);

create or replace function public.touch_ess_scaff_tag_counters_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_scaff_tag_counters_updated_at
  on public.ess_scaff_tag_counters;
create trigger trg_touch_ess_scaff_tag_counters_updated_at
before update on public.ess_scaff_tag_counters
for each row
execute function public.touch_ess_scaff_tag_counters_updated_at();

alter table public.ess_scaff_tag_counters enable row level security;

do $$
declare
  highest_counter_value integer;
  highest_saved_value integer;
  global_start_value integer;
begin
  select coalesce(max(last_value), 0)
  into highest_counter_value
  from public.ess_scaff_tag_counters;

  select coalesce(max(btrim(payload ->> 'tagNumber')::integer), 0)
  into highest_saved_value
  from public.ess_safety_forms
  where form_type = 'scaff-tags'
    and btrim(coalesce(payload ->> 'tagNumber', '')) ~ '^[0-9]{5}$'
    and btrim(reference_number) = btrim(payload ->> 'tagNumber');

  global_start_value := greatest(highest_counter_value, highest_saved_value);

  if global_start_value > 0 then
    insert into public.ess_scaff_tag_counters (builder_id, project_id, last_value)
    values ('__global__', '__global__', global_start_value)
    on conflict (builder_id, project_id)
    do update
      set last_value = greatest(
            public.ess_scaff_tag_counters.last_value,
            excluded.last_value
          ),
          updated_at = timezone('utc', now());
  end if;

  delete from public.ess_scaff_tag_counters
  where builder_id <> '__global__'
     or project_id <> '__global__';
end;
$$;

create or replace function public.allocate_scaff_tag_number(
  p_builder_id text,
  p_project_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  insert into public.ess_scaff_tag_counters (builder_id, project_id, last_value)
  values ('__global__', '__global__', 1)
  on conflict (builder_id, project_id)
  do update
    set last_value = public.ess_scaff_tag_counters.last_value + 1,
        updated_at = timezone('utc', now())
  returning last_value into next_value;

  return lpad(next_value::text, 5, '0');
end;
$$;

create or replace function public.preview_scaff_tag_number(
  p_builder_id text,
  p_project_id text
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lpad(
    (
      coalesce(
        (
          select last_value
          from public.ess_scaff_tag_counters
          where builder_id = '__global__'
            and project_id = '__global__'
        ),
        0
      ) + 1
    )::text,
    5,
    '0'
  );
$$;

grant execute on function public.allocate_scaff_tag_number(text, text)
  to anon, authenticated;
grant execute on function public.preview_scaff_tag_number(text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
