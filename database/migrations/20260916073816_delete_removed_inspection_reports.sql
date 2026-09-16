-- Remove only reports belonging to inspection rows removed in this save.
-- The existing safety-form archive trigger retains the normal deleted-form history.
create or replace function public.delete_removed_scaff_tag_inspection_reports() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  delete from public.ess_safety_forms report
  where report.form_type = 'inspection-reports'
    and report.builder_id = old.builder_id and report.project_id = old.project_id
    and report.payload->>'sourceScaffTagId' = old.id
    and exists (
      select 1 from jsonb_array_elements(coalesce(old.payload->'inspectionRecords', '[]')) row_before
      where row_before->>'id' = report.payload->>'sourceInspectionRowId'
    )
    and not exists (
      select 1 from jsonb_array_elements(coalesce(new.payload->'inspectionRecords', '[]')) row_after
      where row_after->>'id' = report.payload->>'sourceInspectionRowId'
    );
  return new;
end $$;

create trigger trg_delete_removed_scaff_tag_inspection_reports
  after update of payload on public.ess_safety_forms
  for each row when (old.form_type = 'scaff-tags' and new.form_type = 'scaff-tags')
  execute function public.delete_removed_scaff_tag_inspection_reports();
