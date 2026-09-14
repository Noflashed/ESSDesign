-- Manual form dates start the scaffold clock at 07:00 Australia/Sydney.
-- Automatic dates continue to use the first QR assignment. No historical dates
-- are inferred to be manual: older clients did not record that distinction.
begin;

create or replace function public.scaffold_timer_register_id(
  p_type text, p_id text, p_builder text, p_project text, p_payload jsonb
)
returns text
language plpgsql stable security invoker
set search_path = public
as $$
declare
  ids text[];
begin
  if nullif(btrim(p_payload->>'scaffoldRegisterId'), '') is not null then
    return btrim(p_payload->>'scaffoldRegisterId');
  end if;
  select array_agg(distinct btrim(f.payload->>'scaffoldRegisterId')) into ids
  from public.ess_safety_forms f
  where f.builder_id = p_builder and f.project_id = p_project
    and nullif(btrim(f.payload->>'scaffoldRegisterId'), '') is not null
    and (
      (p_type = 'scaff-tags' and f.form_type = 'handover-certificates'
        and (f.id = p_payload->>'handoverFormId' or f.payload->>'scaffTagFormId' = p_id))
      or (p_type = 'handover-certificates' and f.form_type = 'scaff-tags'
        and (f.id = p_payload->>'scaffTagFormId' or f.payload->>'handoverFormId' = p_id))
    );
  -- Ambiguous legacy links must never start an unrelated scaffold's clock.
  return case when cardinality(ids) = 1 then ids[1] else null end;
end;
$$;

create or replace function public.prepare_scaffold_timer_date()
returns trigger
language plpgsql security invoker
set search_path = public
as $$
declare
  previous jsonb := '{}'::jsonb;
  date_key text;
  date_text text;
  selected_date date;
  manual_form public.ess_safety_forms;
  start_at text;
begin
  if tg_op = 'UPDATE' then previous := old.payload; end if;

  if new.form_type in ('scaff-tags', 'handover-certificates') then
    date_key := case when new.form_type = 'scaff-tags' then 'dateErected' else 'inspectionDateTime' end;
    if previous->>'dateManuallySet' = 'true'
      and new.payload->>'dateManuallySet' is distinct from 'true' then
      -- An older editor cannot discard an explicit date by automatically stamping today.
      new.payload := new.payload || jsonb_build_object(
        'dateManuallySet', true, date_key, previous->>date_key);
    end if;
    if new.payload->>'dateManuallySet' = 'true' then
      date_text := btrim(new.payload->>date_key);
      if date_text ~ '^\d{4}-\d{2}-\d{2}$' then
        selected_date := make_date(substring(date_text, 1, 4)::int,
          substring(date_text, 6, 2)::int, substring(date_text, 9, 2)::int);
      elsif date_text ~ '^\d{2}/\d{2}/\d{4}([ ,]|$)' then
        selected_date := make_date(substring(date_text, 7, 4)::int,
          substring(date_text, 4, 2)::int, substring(date_text, 1, 2)::int);
      else
        raise exception 'Select a valid manual scaffold date before saving.';
      end if;
      start_at := to_char((selected_date + time '07:00') at time zone 'Australia/Sydney'
        at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
      new.payload := new.payload || jsonb_build_object(
        'manualStartAt', start_at,
        'manualDateUpdatedAt', case
          when previous->>'manualStartAt' = start_at and previous->>'manualDateUpdatedAt' is not null
            then previous->>'manualDateUpdatedAt'
          else to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        end);
      if new.form_type = 'handover-certificates' then
        new.payload := new.payload || jsonb_build_object('inspectionDateTime', to_char(selected_date, 'DD/MM/YYYY') || ' 7:00 am');
        new.event_date := new.payload->>'inspectionDateTime';
      end if;
    else
      new.payload := new.payload - 'manualStartAt' - 'manualDateUpdatedAt';
    end if;
    return new;
  end if;

  if new.form_type <> 'scaffold-register' then return new; end if;
  -- Resolve from the source records on every register write. A stale register
  -- editor or a later QR scan cannot overwrite a newer manual correction.
  select f.* into manual_form
  from public.ess_safety_forms f
  where f.builder_id = new.builder_id and f.project_id = new.project_id
    and f.form_type in ('scaff-tags', 'handover-certificates')
    and f.payload->>'dateManuallySet' = 'true'
    and nullif(f.payload->>'manualStartAt', '') is not null
    and public.scaffold_timer_register_id(f.form_type, f.id, f.builder_id, f.project_id, f.payload) = new.id
  order by f.payload->>'manualDateUpdatedAt' desc nulls last, f.form_type, f.id
  limit 1;
  if found then
    new.payload := new.payload || jsonb_build_object(
      'manualActivatedAt', manual_form.payload->>'manualStartAt',
      'timerStartSource', 'manual', 'timerStartFormType', manual_form.form_type,
      'timerStartFormId', manual_form.id);
  elsif nullif(previous->>'manualActivatedAt', '') is not null then
    -- Removing a document does not erase the scaffold's recorded start.
    new.payload := new.payload || jsonb_build_object(
      'manualActivatedAt', previous->>'manualActivatedAt', 'timerStartSource', 'manual',
      'timerStartFormType', previous->>'timerStartFormType', 'timerStartFormId', previous->>'timerStartFormId');
  else
    new.payload := new.payload - 'manualActivatedAt';
  end if;
  start_at := coalesce(nullif(new.payload->>'manualActivatedAt', ''),
    nullif(previous->>'activatedAt', ''), nullif(new.payload->>'activatedAt', ''));
  if start_at is not null then
    new.payload := new.payload || jsonb_build_object('activatedAt', start_at,
      'timerStartSource', case when nullif(new.payload->>'manualActivatedAt', '') is not null then 'manual' else 'qr' end);
    new.event_date := start_at;
    if coalesce(previous->>'status', '') = 'dismantled' or nullif(previous->>'dismantledAt', '') is not null then
      new.payload := new.payload || jsonb_build_object('status', 'dismantled', 'dismantledAt', previous->>'dismantledAt');
    elsif coalesce(new.payload->>'status', '') <> 'dismantled' and nullif(new.payload->>'dismantledAt', '') is null then
      new.payload := new.payload || jsonb_build_object('status', 'active');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_manual_scaffold_timer_date()
returns trigger
language plpgsql security invoker
set search_path = public
as $$
declare
  register_id text;
begin
  if new.payload->>'dateManuallySet' is distinct from 'true' then return new; end if;
  if tg_op = 'UPDATE' and new.payload->>'manualDateUpdatedAt' is not distinct from old.payload->>'manualDateUpdatedAt'
    and new.payload->>'scaffoldRegisterId' is not distinct from old.payload->>'scaffoldRegisterId'
    and new.payload->>'scaffTagFormId' is not distinct from old.payload->>'scaffTagFormId'
    and new.payload->>'handoverFormId' is not distinct from old.payload->>'handoverFormId' then
    return new;
  end if;
  register_id := public.scaffold_timer_register_id(new.form_type, new.id, new.builder_id, new.project_id, new.payload);
  update public.ess_safety_forms r
  set payload = r.payload || jsonb_build_object('activatedAt', new.payload->>'manualStartAt')
  where r.form_type = 'scaffold-register' and r.id = register_id
    and r.builder_id = new.builder_id and r.project_id = new.project_id;
  return new;
end;
$$;

create or replace function public.start_scaffold_timer_on_qr_assignment()
returns trigger
language plpgsql security invoker
set search_path = public
as $$
declare
  tag public.ess_safety_forms;
  register_id text;
begin
  if new.status <> 'assigned' or new.assigned_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'assigned'
    and (new.assigned_form_id, new.assigned_builder_id, new.assigned_project_id)
      is not distinct from (old.assigned_form_id, old.assigned_builder_id, old.assigned_project_id) then return new; end if;
  select f.* into tag from public.ess_safety_forms f
  where f.form_type = 'scaff-tags' and f.id = new.assigned_form_id
    and f.builder_id = new.assigned_builder_id and f.project_id = new.assigned_project_id;
  if not found then return new; end if;
  register_id := public.scaffold_timer_register_id(tag.form_type, tag.id, tag.builder_id, tag.project_id, tag.payload);
  update public.ess_safety_forms r
  set payload = r.payload || jsonb_build_object('activatedAt', coalesce(nullif(r.payload->>'activatedAt', ''),
    to_char(new.assigned_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  where r.form_type = 'scaffold-register' and r.id = register_id
    and r.builder_id = tag.builder_id and r.project_id = tag.project_id;
  return new;
end;
$$;

create trigger trg_prepare_scaffold_timer_date
before insert or update on public.ess_safety_forms
for each row execute function public.prepare_scaffold_timer_date();

create trigger trg_sync_manual_scaffold_timer_date
after insert or update on public.ess_safety_forms
for each row when (new.form_type in ('scaff-tags', 'handover-certificates'))
execute function public.sync_manual_scaffold_timer_date();

create trigger trg_start_scaffold_timer_on_qr_assignment
after insert or update on public.ess_scaff_tag_qr_labels
for each row execute function public.start_scaffold_timer_on_qr_assignment();

revoke all on function public.scaffold_timer_register_id(text, text, text, text, jsonb) from public, anon;
grant execute on function public.scaffold_timer_register_id(text, text, text, text, jsonb) to authenticated, service_role;
revoke all on function public.prepare_scaffold_timer_date() from public, anon, authenticated;
revoke all on function public.sync_manual_scaffold_timer_date() from public, anon, authenticated;
revoke all on function public.start_scaffold_timer_on_qr_assignment() from public, anon, authenticated;

commit;
