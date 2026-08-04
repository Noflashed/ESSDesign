-- Read-only previews for the next safety-form number. Previewing does not
-- reserve or increment a number; the existing allocator remains authoritative
-- when a form is saved.

begin;

create or replace function public.preview_safety_form_number(
  p_form_type text,
  p_builder_id text,
  p_project_id text,
  p_width integer
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  existing_max integer;
  counter_value integer;
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

  select coalesce(last_value, 0)
  into counter_value
  from public.ess_safety_form_counters
  where form_type = p_form_type
    and builder_id = p_builder_id
    and project_id = p_project_id;

  next_value := greatest(existing_max, coalesce(counter_value, 0)) + 1;
  return lpad(next_value::text, greatest(1, least(coalesce(p_width, 1), 12)), '0');
end;
$$;

create or replace function public.preview_handover_inspection_number(
  p_builder_id text,
  p_project_id text
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.preview_safety_form_number(
    'handover-certificates',
    p_builder_id,
    p_project_id,
    4
  );
$$;

revoke all on function public.preview_safety_form_number(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.preview_handover_inspection_number(text, text)
  from public;

grant execute on function public.preview_handover_inspection_number(text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select to_regprocedure(
  'public.preview_handover_inspection_number(text,text)'
) is not null as handover_number_preview_ready;
