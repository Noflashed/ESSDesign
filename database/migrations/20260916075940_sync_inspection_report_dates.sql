-- Scaff-Tag row dates remain authoritative without overwriting report edits.
create or replace function public.sync_scaff_tag_inspection_report_dates() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare r jsonb; date_text text; inspected_date date; stamp text; report_title text;
begin
  for r in select value from jsonb_array_elements(coalesce(new.payload->'inspectionRecords','[]')) loop
    if nullif(r->>'id','') is null or nullif(btrim(r->>'date'),'') is null
      or nullif(btrim(r->>'time'),'') is null then continue; end if;
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
    update public.ess_safety_forms report
      set event_date=stamp, title=report_title, pdf_path='',
        payload=report.payload || jsonb_build_object('inspectionDateTime',stamp,
          'reportTitle',report_title,'dateManuallySet',true,'pdfPath','','updatedAt',now())
      where report.form_type='inspection-reports' and report.builder_id=new.builder_id
        and report.project_id=new.project_id and report.payload->>'sourceScaffTagId'=new.id
        and report.payload->>'sourceInspectionRowId'=r->>'id'
        and report.payload->>'inspectionDateTime' is distinct from stamp;
  end loop;
  return new;
end $$;
create trigger trg_sync_scaff_tag_inspection_report_dates
  after update of payload on public.ess_safety_forms
  for each row when (new.form_type='scaff-tags')
  execute function public.sync_scaff_tag_inspection_report_dates();
