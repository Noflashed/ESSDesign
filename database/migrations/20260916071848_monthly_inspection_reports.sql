-- Inspection reports share the handover payload/layout but are independent records.
alter table public.ess_safety_forms drop constraint ess_safety_forms_form_type_check;
alter table public.ess_safety_forms add constraint ess_safety_forms_form_type_check check (form_type in ('scaff-tags','handover-certificates','inspection-reports','day-labour-variations','scaffold-register','pre-starts'));
alter table public.ess_deleted_safety_forms drop constraint ess_deleted_safety_forms_form_type_check;
alter table public.ess_deleted_safety_forms add constraint ess_deleted_safety_forms_form_type_check check (form_type in ('scaff-tags','handover-certificates','inspection-reports','day-labour-variations','scaffold-register','pre-starts'));

-- Stable row identities survive date edits, removal of other rows and repeat saves.
create or replace function public.prepare_scaff_tag_inspection_row_ids() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare r jsonb; previous jsonb; rows jsonb := '[]'; used_ids text[] := '{}'; row_id text; ordinal bigint;
begin
  for r, ordinal in select value, ordinality from jsonb_array_elements(coalesce(new.payload->'inspectionRecords','[]')) with ordinality loop
    if coalesce(r->>'date','') <> '' then
      row_id := nullif(r->>'id','');
      if row_id is null and tg_op = 'UPDATE' then
        previous := null;
        -- Older app versions do not round-trip IDs, but keep inspectedAt stable.
        select value into previous from jsonb_array_elements(coalesce(old.payload->'inspectionRecords','[]'))
          where nullif(r->>'inspectedAt','') is not null and value->>'inspectedAt' = r->>'inspectedAt'
          and not coalesce(value->>'id','') = any(used_ids) limit 1;
        if previous is null and nullif(r->>'inspectedAt','') is null then
          previous := old.payload->'inspectionRecords'->(ordinal::int - 1);
        end if;
        row_id := nullif(previous->>'id','');
      end if;
      if row_id is null or row_id = any(used_ids) then row_id := gen_random_uuid()::text; end if;
      used_ids := array_append(used_ids,row_id);
      r := r || jsonb_build_object('id',row_id);
    end if;
    rows := rows || jsonb_build_array(r);
  end loop;
  new.payload := jsonb_set(new.payload,'{inspectionRecords}',rows);
  return new;
end $$;
create trigger trg_scaff_tag_inspection_row_ids before insert or update of payload on public.ess_safety_forms
for each row when (new.form_type='scaff-tags') execute function public.prepare_scaff_tag_inspection_row_ids();

create or replace function public.create_scaff_tag_inspection_reports() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare source public.ess_safety_forms%rowtype; tag public.ess_safety_forms%rowtype;
  r jsonb; report_id text; report_payload jsonb; report_title text; date_text text; inspected_date date; stamp text;
begin
  if new.form_type = 'handover-certificates' then
    -- Catch inspections saved before their initial handover was linked.
    if pg_trigger_depth() > 1 then return new; end if;
    for tag in select * from public.ess_safety_forms t where t.form_type='scaff-tags'
      and t.builder_id=new.builder_id and t.project_id=new.project_id
      and (t.payload->>'handoverFormId'=new.id or new.payload->>'scaffTagFormId'=t.id
        or (nullif(new.payload->>'scaffoldRegisterId','') is not null and t.payload->>'scaffoldRegisterId'=new.payload->>'scaffoldRegisterId')) loop
      update public.ess_safety_forms set payload=payload where form_type='scaff-tags' and id=tag.id;
    end loop;
    return new;
  end if;
  -- Use the first handover for this scaffold, restricted to the same site/client.
  select * into source from public.ess_safety_forms h where h.form_type='handover-certificates'
    and h.builder_id=new.builder_id and h.project_id=new.project_id
    and (h.id=new.payload->>'handoverFormId' or h.payload->>'scaffTagFormId'=new.id
      or (nullif(new.payload->>'scaffoldRegisterId','') is not null and h.payload->>'scaffoldRegisterId'=new.payload->>'scaffoldRegisterId'))
    order by h.created_at,h.id limit 1;
  if source.id is null then return new; end if;
  for r in select value from jsonb_array_elements(coalesce(new.payload->'inspectionRecords','[]')) loop
    -- Blank/partial rows do not create reports; the first completed row does.
    if nullif(btrim(r->>'date'),'') is null or nullif(btrim(r->>'time'),'') is null
       or nullif(btrim(r->>'competentPerson'),'') is null or nullif(r->>'id','') is null then continue; end if;
    date_text := r->>'date';
    begin
      if date_text ~ '^\d{4}-\d{2}-\d{2}$' then inspected_date := date_text::date;
      elsif date_text ~ '^\d{2}/\d{2}/\d{4}$' then
        inspected_date := to_date(date_text,'DD/MM/YYYY');
        if to_char(inspected_date,'DD/MM/YYYY') <> date_text then continue; end if;
      else continue; end if;
    exception when others then continue;
    end;
    stamp := to_char(inspected_date,'DD/MM/YYYY') || ' ' || btrim(r->>'time');
    report_title := to_char(inspected_date,'FMMonth DD/MM/YYYY') || ' Inspection Report';
    report_id := 'inspection-' || md5(new.builder_id || ':' || new.project_id || ':' || new.id || ':' || (r->>'id'));
    report_payload := (source.payload - array['pdfPath','sharePath','photoPaths','photoSlots','completedAt','completedByUserId']) || jsonb_build_object(
      'id',report_id,'documentKind','inspection-report','sourceHandoverId',source.id,
      'sourceScaffTagId',new.id,'sourceInspectionRowId',r->>'id','reportTitle',report_title,
      'scaffoldRegisterId',coalesce(nullif(new.payload->>'scaffoldRegisterId',''),source.payload->>'scaffoldRegisterId',''),
      'inspectionDateTime',stamp,'dateManuallySet',true,'photoSlots','[]'::jsonb,'photoPaths','[]'::jsonb,
      'pdfPath','','createdAt',now(),'updatedAt',now());
    insert into public.ess_safety_forms(form_type,id,builder_id,project_id,title,reference_number,requested_by,project_label,event_date,payload,created_by_user_id)
      values('inspection-reports',report_id,new.builder_id,new.project_id,report_title,source.reference_number,source.requested_by,source.project_label,stamp,report_payload,new.created_by_user_id)
      on conflict(form_type,id) do nothing; -- Keep subsequent report edits intact.
  end loop;
  return new;
end $$;
create trigger trg_create_scaff_tag_inspection_reports after insert or update of payload on public.ess_safety_forms
for each row when (new.form_type in ('scaff-tags','handover-certificates')) execute function public.create_scaff_tag_inspection_reports();

-- Preserve existing delete/archive behaviour for the new document type.
create or replace function public.delete_scaffold_inspection_reports() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  delete from public.ess_safety_forms where form_type='inspection-reports' and builder_id=old.builder_id and project_id=old.project_id
    and ((old.form_type='scaffold-register' and payload->>'scaffoldRegisterId'=old.id)
      or (old.form_type='scaff-tags' and payload->>'sourceScaffTagId'=old.id));
  return old;
end $$;
create trigger trg_delete_scaffold_inspection_reports before delete on public.ess_safety_forms
for each row when (old.form_type in ('scaffold-register','scaff-tags')) execute function public.delete_scaffold_inspection_reports();
