-- Concurrency-safe numbering for relational handover and day-labour forms.
-- Existing relational records are used to seed each project counter, so this
-- migration is safe to run after migration 040 and does not alter form data.

begin;

create table if not exists public.ess_safety_form_counters (
  form_type text not null check (
    form_type in ('handover-certificates', 'day-labour-variations')
  ),
  builder_id text not null,
  project_id text not null,
  last_value integer not null default 0 check (last_value >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (form_type, builder_id, project_id),
  foreign key (project_id, builder_id)
    references public.ess_site_projects (id, builder_id)
    on delete cascade
);

create or replace function public.touch_ess_safety_form_counters_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_safety_form_counters_updated_at
  on public.ess_safety_form_counters;
create trigger trg_touch_ess_safety_form_counters_updated_at
before update on public.ess_safety_form_counters
for each row
execute function public.touch_ess_safety_form_counters_updated_at();

alter table public.ess_safety_form_counters enable row level security;
revoke all on table public.ess_safety_form_counters from public, anon, authenticated;
grant all on table public.ess_safety_form_counters to service_role;

do $$
begin
  if to_regclass('public.ess_handover_inspection_counters') is not null then
    execute $seed$
      insert into public.ess_safety_form_counters (
        form_type,
        builder_id,
        project_id,
        last_value,
        created_at,
        updated_at
      )
      select
        'handover-certificates',
        legacy.builder_id,
        legacy.project_id,
        greatest(legacy.last_value, 0),
        legacy.created_at,
        legacy.updated_at
      from public.ess_handover_inspection_counters as legacy
      join public.ess_site_projects as project
        on project.id = legacy.project_id
       and project.builder_id = legacy.builder_id
      on conflict (form_type, builder_id, project_id)
      do update
        set last_value = greatest(
              public.ess_safety_form_counters.last_value,
              excluded.last_value
            ),
            updated_at = greatest(
              public.ess_safety_form_counters.updated_at,
              excluded.updated_at
            )
    $seed$;
  end if;
end;
$$;

create or replace function public.allocate_safety_form_number(
  p_form_type text,
  p_builder_id text,
  p_project_id text,
  p_width integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_max integer;
  next_value integer;
begin
  if p_form_type not in ('handover-certificates', 'day-labour-variations') then
    raise exception 'Unsupported safety form type';
  end if;
  if nullif(btrim(p_builder_id), '') is null
      or nullif(btrim(p_project_id), '') is null then
    raise exception 'Builder and project are required';
  end if;

  select coalesce(
    max(
      nullif(
        regexp_replace(reference_number, '[^0-9]', '', 'g'),
        ''
      )::integer
    ),
    0
  )
  into existing_max
  from public.ess_safety_forms
  where form_type = p_form_type
    and builder_id = p_builder_id
    and project_id = p_project_id;

  insert into public.ess_safety_form_counters (
    form_type,
    builder_id,
    project_id,
    last_value
  )
  values (
    p_form_type,
    p_builder_id,
    p_project_id,
    existing_max + 1
  )
  on conflict (form_type, builder_id, project_id)
  do update
    set last_value = greatest(
          public.ess_safety_form_counters.last_value,
          existing_max
        ) + 1,
        updated_at = timezone('utc', now())
  returning last_value into next_value;

  return lpad(next_value::text, greatest(1, least(coalesce(p_width, 1), 12)), '0');
end;
$$;

create or replace function public.allocate_handover_inspection_number(
  p_builder_id text,
  p_project_id text
)
returns text
language sql
security definer
set search_path = public
as $$
  select public.allocate_safety_form_number(
    'handover-certificates',
    p_builder_id,
    p_project_id,
    4
  );
$$;

create or replace function public.allocate_day_labour_variation_number(
  p_builder_id text,
  p_project_id text
)
returns text
language sql
security definer
set search_path = public
as $$
  select public.allocate_safety_form_number(
    'day-labour-variations',
    p_builder_id,
    p_project_id,
    5
  );
$$;

revoke all on function public.allocate_safety_form_number(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.allocate_handover_inspection_number(text, text)
  from public;
revoke all on function public.allocate_day_labour_variation_number(text, text)
  from public;

-- Anonymous execution is retained temporarily for already-installed iOS builds.
-- The functions only allocate monotonically increasing display numbers; all form
-- table access remains authenticated.
grant execute on function public.allocate_handover_inspection_number(text, text)
  to anon, authenticated;
grant execute on function public.allocate_day_labour_variation_number(text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select
  to_regclass('public.ess_safety_form_counters') is not null
    as safety_form_counters_ready,
  to_regprocedure(
    'public.allocate_handover_inspection_number(text,text)'
  ) is not null as handover_allocator_ready,
  to_regprocedure(
    'public.allocate_day_labour_variation_number(text,text)'
  ) is not null as day_labour_allocator_ready;
