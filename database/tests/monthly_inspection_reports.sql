-- Run after the migration; all fixture changes are rolled back.
begin;
do $$
declare b text; p text; tag_payload jsonb; source_payload jsonb; report public.ess_safety_forms%rowtype; c int;
begin
 select builder_id,id into b,p from public.ess_site_projects limit 1;
 source_payload := jsonb_build_object('scaffoldRegisterId','test-monthly-scaffold','scaffTagFormId','test-monthly-tag','companyEntityId','maloo','inspectionNumber','TEST','formReferenceName','Test original','inspectionDateTime','01/09/2026 09:00 am','checklist',jsonb_build_object('test','YES'),'clientSignatureStrokes','[[{"x":1,"y":2}]]'::jsonb,'photoSlots','[{"slot":0,"path":"do-not-copy.jpg"}]'::jsonb);
 insert into public.ess_safety_forms(form_type,id,builder_id,project_id,payload) values('handover-certificates','test-monthly-handover',b,p,source_payload);
 tag_payload := jsonb_build_object('handoverFormId','test-monthly-handover','scaffoldRegisterId','test-monthly-scaffold','inspectionRecords','[{"date":"2026-12-16","time":"10:30 am","competentPerson":"Sample Inspector","inspectedAt":"2026-12-16T00:30:00Z"}]'::jsonb);
 insert into public.ess_safety_forms(form_type,id,builder_id,project_id,payload) values('scaff-tags','test-monthly-tag',b,p,tag_payload);
 select * into report from public.ess_safety_forms where form_type='inspection-reports' and payload->>'sourceScaffTagId'='test-monthly-tag';
 if report.id is null then raise exception 'First row did not create report'; end if;
 if report.payload->>'inspectionDateTime' <> '16/12/2026 10:30 am' then raise exception 'Wrong inspection time'; end if;
 if report.title <> 'December 16/12/2026 Inspection Report' then raise exception 'Wrong title: %',report.title; end if;
 if report.payload->'photoSlots' <> '[]'::jsonb or report.payload->'photoPaths' <> '[]'::jsonb then raise exception 'Photos copied'; end if;
 if report.payload->'checklist' <> source_payload->'checklist' or report.payload->'clientSignatureStrokes' <> source_payload->'clientSignatureStrokes' or report.payload->>'companyEntityId' <> 'maloo' then raise exception 'Fields not copied'; end if;
 update public.ess_safety_forms set payload=payload||'{"comments":"independent edit"}'::jsonb where form_type='inspection-reports' and id=report.id;
 update public.ess_safety_forms set payload=tag_payload where form_type='scaff-tags' and id='test-monthly-tag';
 select count(*) into c from public.ess_safety_forms where form_type='inspection-reports' and payload->>'sourceScaffTagId'='test-monthly-tag';
 if c<>1 then raise exception 'Duplicate on retry'; end if;
 if (select payload->>'comments' from public.ess_safety_forms where form_type='inspection-reports' and id=report.id) <> 'independent edit' then raise exception 'Report edits overwritten'; end if;
 tag_payload := jsonb_set(tag_payload,'{inspectionRecords}',(tag_payload->'inspectionRecords')||'[{"date":"16/01/2027","time":"11:30 am","competentPerson":"Sample Inspector","inspectedAt":"2027-01-16T00:30:00Z"},{"date":"2027-02-16","time":"12:30 pm","competentPerson":"Sample Inspector","inspectedAt":"2027-02-16T01:30:00Z"},{"date":"2027-03-16","time":"1:30 pm","competentPerson":"Sample Inspector","inspectedAt":"2027-03-16T02:30:00Z"},{"date":"2027-04-16","time":"","competentPerson":""}]'::jsonb);
 update public.ess_safety_forms set payload=tag_payload where form_type='scaff-tags' and id='test-monthly-tag';
 select count(*) into c from public.ess_safety_forms where form_type='inspection-reports' and payload->>'sourceScaffTagId'='test-monthly-tag';
 if c<>4 then raise exception 'Expected 4 reports, got %',c; end if;
 -- Missing source handover: save the tag first, then create/link the handover.
 insert into public.ess_safety_forms(form_type,id,builder_id,project_id,payload) values('scaff-tags','test-monthly-late-tag',b,p,tag_payload||'{"handoverFormId":"test-monthly-late-handover","scaffoldRegisterId":"test-monthly-late-scaffold"}'::jsonb);
 if exists(select 1 from public.ess_safety_forms where form_type='inspection-reports' and payload->>'sourceScaffTagId'='test-monthly-late-tag') then raise exception 'Used unrelated handover'; end if;
 insert into public.ess_safety_forms(form_type,id,builder_id,project_id,payload) values('handover-certificates','test-monthly-late-handover',b,p,source_payload||'{"scaffoldRegisterId":"test-monthly-late-scaffold","scaffTagFormId":"test-monthly-late-tag"}'::jsonb);
 select count(*) into c from public.ess_safety_forms where form_type='inspection-reports' and payload->>'sourceScaffTagId'='test-monthly-late-tag';
 if c<>4 then raise exception 'Late handover did not create reports'; end if;
 -- Editing an identified inspection must not generate another report.
 select payload into tag_payload from public.ess_safety_forms where form_type='scaff-tags' and id='test-monthly-tag';
 tag_payload := jsonb_set(tag_payload,'{inspectionRecords,0,date}','"2026-12-17"'::jsonb);
 update public.ess_safety_forms set payload=tag_payload where form_type='scaff-tags' and id='test-monthly-tag';
 select count(*) into c from public.ess_safety_forms where form_type='inspection-reports' and payload->>'sourceScaffTagId'='test-monthly-tag';
 if c<>4 then raise exception 'Date edit duplicated report'; end if;
 -- Removing a row preserves all remaining row identities and report history.
 tag_payload := jsonb_set(tag_payload,'{inspectionRecords}',(tag_payload->'inspectionRecords')-1);
 update public.ess_safety_forms set payload=tag_payload where form_type='scaff-tags' and id='test-monthly-tag';
 select count(*) into c from public.ess_safety_forms where form_type='inspection-reports' and payload->>'sourceScaffTagId'='test-monthly-tag';
 if c<>4 then raise exception 'Row removal changed report history'; end if;
 delete from public.ess_safety_forms where form_type='scaff-tags' and id='test-monthly-tag';
 if exists(select 1 from public.ess_safety_forms where form_type='inspection-reports' and payload->>'sourceScaffTagId'='test-monthly-tag') then raise exception 'Tag deletion left orphan reports'; end if;
end $$;

rollback;
