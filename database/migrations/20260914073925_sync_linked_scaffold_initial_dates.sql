begin;

create or replace function public.scaffold_initial_calendar_date(p_type text, p_payload jsonb)
returns date language plpgsql immutable security invoker set search_path = public
as $$
declare
  value text := btrim(case when p_type = 'scaff-tags' then p_payload->>'dateErected' else p_payload->>'inspectionDateTime' end);
begin
  if value ~ '^\d{4}-\d{2}-\d{2}$' then
    return make_date(substring(value, 1, 4)::int, substring(value, 6, 2)::int, substring(value, 9, 2)::int);
  elsif value ~ '^\d{2}/\d{2}/\d{4}([ ,]|$)' then
    return make_date(substring(value, 7, 4)::int, substring(value, 4, 2)::int, substring(value, 1, 2)::int);
  end if;
  return null;
end;
$$;

create or replace function public.prepare_linked_scaffold_initial_date()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  peer public.ess_safety_forms;
  link_key text := case when new.form_type = 'scaff-tags' then 'handoverFormId' else 'scaffTagFormId' end;
  reverse_key text := case when new.form_type = 'scaff-tags' then 'scaffTagFormId' else 'handoverFormId' end;
  date_key text := case when new.form_type = 'scaff-tags' then 'dateErected' else 'inspectionDateTime' end;
  selected_date date;
  time_text text;
begin
  if pg_trigger_depth() > 1 or new.payload->>'dateManuallySet' = 'true' then return new; end if;
  if tg_op = 'UPDATE'
    and new.payload->>link_key is not distinct from old.payload->>link_key
    and new.payload->>'scaffoldRegisterId' is not distinct from old.payload->>'scaffoldRegisterId' then
    -- Routine saves from older app versions must not reset the initial date.
    if nullif(old.payload->>date_key, '') is not null then
      new.payload := new.payload || jsonb_build_object(date_key, old.payload->>date_key);
      if new.form_type = 'handover-certificates' then new.event_date := new.payload->>date_key; end if;
    end if;
  end if;
  select f.* into peer from public.ess_safety_forms f
  where f.builder_id = new.builder_id and f.project_id = new.project_id
    and f.form_type = case when new.form_type = 'scaff-tags' then 'handover-certificates' else 'scaff-tags' end
    and (f.id = new.payload->>link_key or f.payload->>reverse_key = new.id
      or (nullif(new.payload->>link_key, '') is null and nullif(f.payload->>reverse_key, '') is null
        and nullif(new.payload->>'scaffoldRegisterId', '') is not null
        and f.payload->>'scaffoldRegisterId' = new.payload->>'scaffoldRegisterId'))
  order by (f.payload->>'dateManuallySet' = 'true') desc nulls last,
    f.payload->>'manualDateUpdatedAt' desc nulls last, f.created_at, f.id
  limit 1;
  if not found then return new; end if;
  selected_date := public.scaffold_initial_calendar_date(peer.form_type, peer.payload);
  if selected_date is null then return new; end if;
  if new.form_type = 'scaff-tags' then
    new.payload := new.payload || jsonb_build_object(date_key, to_char(selected_date, 'YYYY-MM-DD'));
  else
    time_text := coalesce(substring(new.payload->>date_key from '(\d{1,2}:\d{2}[[:space:]]*[ap]m)$'),
      to_char(now() at time zone 'Australia/Sydney', 'FMHH12:MI am'));
    new.payload := new.payload || jsonb_build_object(date_key, to_char(selected_date, 'DD/MM/YYYY') || ' ' || time_text);
    new.event_date := new.payload->>date_key;
  end if;
  if peer.payload->>'dateManuallySet' = 'true' then
    new.payload := new.payload || jsonb_build_object('dateManuallySet', true);
  end if;
  return new;
end;
$$;

create or replace function public.sync_linked_scaffold_initial_date()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  selected_date date;
  peer public.ess_safety_forms;
  link_key text := case when new.form_type = 'scaff-tags' then 'handoverFormId' else 'scaffTagFormId' end;
  reverse_key text := case when new.form_type = 'scaff-tags' then 'scaffTagFormId' else 'handoverFormId' end;
  peer_date_key text := case when new.form_type = 'scaff-tags' then 'inspectionDateTime' else 'dateErected' end;
  date_value text;
  time_text text;
  manual boolean := coalesce(new.payload->>'dateManuallySet' = 'true', false);
begin
  if pg_trigger_depth() > 1 then return new; end if;
  selected_date := public.scaffold_initial_calendar_date(new.form_type, new.payload);
  if selected_date is null then return new; end if;
  for peer in select f.* from public.ess_safety_forms f
    where f.builder_id = new.builder_id and f.project_id = new.project_id
      and f.form_type = case when new.form_type = 'scaff-tags' then 'handover-certificates' else 'scaff-tags' end
      and (f.id = new.payload->>link_key or f.payload->>reverse_key = new.id
        or (nullif(new.payload->>link_key, '') is null and nullif(f.payload->>reverse_key, '') is null
          and nullif(new.payload->>'scaffoldRegisterId', '') is not null
          and f.payload->>'scaffoldRegisterId' = new.payload->>'scaffoldRegisterId'))
      and (public.scaffold_initial_calendar_date(f.form_type, f.payload) is distinct from selected_date
        or (manual and f.payload->>'dateManuallySet' is distinct from 'true'))
  loop
    if peer.form_type = 'scaff-tags' then
      date_value := to_char(selected_date, 'YYYY-MM-DD');
    else
      time_text := case when manual then '7:00 am' else
        coalesce(substring(peer.payload->>'inspectionDateTime' from '(\d{1,2}:\d{2}[[:space:]]*[ap]m)$'),
          to_char(now() at time zone 'Australia/Sydney', 'FMHH12:MI am')) end;
      date_value := to_char(selected_date, 'DD/MM/YYYY') || ' ' || time_text;
    end if;
    update public.ess_safety_forms f set
      payload = f.payload || jsonb_build_object(peer_date_key, date_value, 'dateManuallySet', manual),
      event_date = case when f.form_type = 'handover-certificates' then date_value else f.event_date end
    where f.form_type = peer.form_type and f.id = peer.id
      and f.builder_id = new.builder_id and f.project_id = new.project_id;
  end loop;
  return new;
end;
$$;

-- Run before the manual timer preparation, and mirror dates before timer propagation.
create trigger trg_initial_linked_scaffold_date
before insert or update on public.ess_safety_forms
for each row when (new.form_type in ('scaff-tags', 'handover-certificates'))
execute function public.prepare_linked_scaffold_initial_date();

create trigger trg_sync_linked_scaffold_initial_date
after insert or update on public.ess_safety_forms
for each row when (new.form_type in ('scaff-tags', 'handover-certificates'))
execute function public.sync_linked_scaffold_initial_date();

revoke all on function public.scaffold_initial_calendar_date(text, jsonb) from public, anon;
grant execute on function public.scaffold_initial_calendar_date(text, jsonb) to authenticated, service_role;
revoke all on function public.prepare_linked_scaffold_initial_date() from public, anon, authenticated;
revoke all on function public.sync_linked_scaffold_initial_date() from public, anon, authenticated;

commit;
