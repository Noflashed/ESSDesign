-- Keep scaffold names and drawing selections aligned across every linked Safety form.
--
-- Scaffold Register records are the canonical source. Renames update live Scaff-Tag
-- QR payloads, handovers and linked Day Labour forms. Drawing re-selection updates
-- every linked handover and Day Labour payload. The app also rebuilds stored PDFs.

begin;

create or replace function public.sync_scaffold_register_links_to_safety_forms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_name text := nullif(btrim(old.payload->>'scaffoldName'), '');
  new_name text := nullif(btrim(new.payload->>'scaffoldName'), '');
  name_changed boolean := old_name is distinct from new_name and new_name is not null;
  drawing_changed boolean :=
    coalesce(old.payload->>'drawingDocumentId', '') is distinct from coalesce(new.payload->>'drawingDocumentId', '')
    or coalesce(old.payload->>'drawingDocumentType', '') is distinct from coalesce(new.payload->>'drawingDocumentType', '')
    or coalesce(old.payload->>'drawingDocumentName', '') is distinct from coalesce(new.payload->>'drawingDocumentName', '')
    or coalesce(old.payload->>'drawingRevisionNumber', '') is distinct from coalesce(new.payload->>'drawingRevisionNumber', '')
    or coalesce(old.payload->>'drawingFolderId', '') is distinct from coalesce(new.payload->>'drawingFolderId', '')
    or coalesce(old.payload->>'drawingNumber', '') is distinct from coalesce(new.payload->>'drawingNumber', '');
begin
  if name_changed then
    update public.ess_safety_forms safety_form
    set payload = jsonb_set(
          jsonb_set(
            jsonb_set(
              safety_form.payload,
              '{scaffoldNo}',
              to_jsonb(new_name),
              true
            ),
            '{scaffoldRegisterId}',
            to_jsonb(new.id),
            true
          ),
          '{handoverReferenceName}',
          case
            when lower(btrim(coalesce(safety_form.payload->>'handoverReferenceName', ''))) = lower(coalesce(old_name, ''))
              then to_jsonb(new_name)
            else to_jsonb(coalesce(safety_form.payload->>'handoverReferenceName', ''))
          end,
          true
        ),
        title = new_name,
        updated_at = timezone('utc', now())
    where safety_form.form_type = 'scaff-tags'
      and safety_form.builder_id = new.builder_id
      and safety_form.project_id = new.project_id
      and (
        safety_form.payload->>'scaffoldRegisterId' = new.id
        or (
          nullif(btrim(safety_form.payload->>'scaffoldRegisterId'), '') is null
          and lower(btrim(coalesce(safety_form.payload->>'scaffoldNo', ''))) = lower(coalesce(old_name, ''))
        )
      );

    update public.ess_safety_forms safety_form
    set payload = jsonb_set(
          jsonb_set(
            safety_form.payload,
            '{formReferenceName}',
            to_jsonb(new_name),
            true
          ),
          '{scaffoldRegisterId}',
          to_jsonb(new.id),
          true
        ),
        title = new_name,
        updated_at = timezone('utc', now())
    where safety_form.form_type = 'handover-certificates'
      and safety_form.builder_id = new.builder_id
      and safety_form.project_id = new.project_id
      and (
        safety_form.payload->>'scaffoldRegisterId' = new.id
        or (
          nullif(btrim(safety_form.payload->>'scaffoldRegisterId'), '') is null
          and lower(btrim(coalesce(safety_form.payload->>'formReferenceName', ''))) = lower(coalesce(old_name, ''))
        )
      );

    update public.ess_safety_forms safety_form
    set payload = jsonb_set(
          jsonb_set(
            safety_form.payload,
            '{handoverDocumentTitle}',
            to_jsonb(new_name),
            true
          ),
          '{formReferenceName}',
          case
            when lower(btrim(coalesce(safety_form.payload->>'formReferenceName', ''))) = lower(coalesce(old_name, ''))
              then to_jsonb(new_name)
            else to_jsonb(coalesce(safety_form.payload->>'formReferenceName', ''))
          end,
          true
        ),
        title = case
          when lower(btrim(coalesce(safety_form.title, ''))) = lower(coalesce(old_name, ''))
            then new_name
          else safety_form.title
        end,
        updated_at = timezone('utc', now())
    where safety_form.form_type = 'day-labour-variations'
      and safety_form.builder_id = new.builder_id
      and safety_form.project_id = new.project_id
      and safety_form.payload->>'handoverDocumentId' in (
        select handover.id
        from public.ess_safety_forms handover
        where handover.form_type = 'handover-certificates'
          and handover.builder_id = new.builder_id
          and handover.project_id = new.project_id
          and handover.payload->>'scaffoldRegisterId' = new.id
      );
  end if;

  if drawing_changed then
    update public.ess_safety_forms safety_form
    set payload = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    safety_form.payload,
                    '{drawingNumber}',
                    to_jsonb(coalesce(new.payload->>'drawingNumber', '')),
                    true
                  ),
                  '{drawingDocumentId}',
                  to_jsonb(coalesce(new.payload->>'drawingDocumentId', '')),
                  true
                ),
                '{drawingDocumentType}',
                to_jsonb(coalesce(new.payload->>'drawingDocumentType', '')),
                true
              ),
              '{drawingDocumentName}',
              to_jsonb(coalesce(new.payload->>'drawingDocumentName', '')),
              true
            ),
            '{drawingRevisionNumber}',
            to_jsonb(coalesce(new.payload->>'drawingRevisionNumber', '')),
            true
          ),
          '{drawingFolderId}',
          to_jsonb(coalesce(new.payload->>'drawingFolderId', '')),
          true
        ),
        updated_at = timezone('utc', now())
    where safety_form.form_type = 'handover-certificates'
      and safety_form.builder_id = new.builder_id
      and safety_form.project_id = new.project_id
      and safety_form.payload->>'scaffoldRegisterId' = new.id;

    update public.ess_safety_forms safety_form
    set payload = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  safety_form.payload,
                  '{drawingDocumentId}',
                  to_jsonb(coalesce(new.payload->>'drawingDocumentId', '')),
                  true
                ),
                '{drawingDocumentType}',
                to_jsonb(coalesce(new.payload->>'drawingDocumentType', '')),
                true
              ),
              '{drawingDocumentName}',
              to_jsonb(coalesce(new.payload->>'drawingDocumentName', '')),
              true
            ),
            '{drawingRevisionNumber}',
            to_jsonb(coalesce(new.payload->>'drawingRevisionNumber', '')),
            true
          ),
          '{drawingFolderId}',
          to_jsonb(coalesce(new.payload->>'drawingFolderId', '')),
          true
        ),
        updated_at = timezone('utc', now())
    where safety_form.form_type = 'day-labour-variations'
      and safety_form.builder_id = new.builder_id
      and safety_form.project_id = new.project_id
      and safety_form.payload->>'handoverDocumentId' in (
        select handover.id
        from public.ess_safety_forms handover
        where handover.form_type = 'handover-certificates'
          and handover.builder_id = new.builder_id
          and handover.project_id = new.project_id
          and handover.payload->>'scaffoldRegisterId' = new.id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_scaffold_register_links_to_safety_forms
  on public.ess_safety_forms;

create trigger trg_sync_scaffold_register_links_to_safety_forms
after update of payload, title on public.ess_safety_forms
for each row
when (
  old.form_type = 'scaffold-register'
  and new.form_type = 'scaffold-register'
)
execute function public.sync_scaffold_register_links_to_safety_forms();

revoke all on function public.sync_scaffold_register_links_to_safety_forms()
  from public, anon, authenticated;

commit;
