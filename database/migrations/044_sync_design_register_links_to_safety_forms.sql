-- Keep Safety forms aligned with the live Design Register.
--
-- New revisions move linked forms to the newest downloadable document in the
-- selected drawing folder. Deletions fall back to the newest remaining
-- revision, or clear the drawing link when the folder no longer has a drawing.

begin;

create or replace function public.sync_latest_design_revision_to_safety_forms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_document public.design_documents%rowtype;
begin
  select document.*
  into latest_document
  from public.design_documents document
  where document.folder_id = new.folder_id
    and (
      nullif(btrim(document.ess_design_issue_path), '') is not null
      or nullif(btrim(document.third_party_design_path), '') is not null
    )
  order by
    coalesce(
      nullif(substring(coalesce(document.revision_number, '') from '[0-9]+'), '')::integer,
      -1
    ) desc,
    document.updated_at desc,
    document.created_at desc
  limit 1;

  if latest_document.id is null then
    return new;
  end if;

  update public.ess_safety_forms safety_form
  set payload = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                safety_form.payload - 'drawingUnavailable' - 'drawingUnavailableReason',
                '{drawingDocumentId}',
                to_jsonb(latest_document.id::text),
                true
              ),
              '{drawingDocumentType}',
              to_jsonb(
                case
                  when safety_form.payload->>'drawingDocumentType' = 'thirdparty'
                    and nullif(btrim(latest_document.third_party_design_path), '') is not null
                    then 'thirdparty'
                  when nullif(btrim(latest_document.ess_design_issue_path), '') is not null
                    then 'ess'
                  else 'thirdparty'
                end::text
              ),
              true
            ),
            '{drawingDocumentName}',
            to_jsonb(
              coalesce(
                case
                  when safety_form.payload->>'drawingDocumentType' = 'thirdparty'
                    and nullif(btrim(latest_document.third_party_design_path), '') is not null
                    then latest_document.third_party_design_name
                  when nullif(btrim(latest_document.ess_design_issue_path), '') is not null
                    then latest_document.ess_design_issue_name
                  else latest_document.third_party_design_name
                end,
                latest_document.description,
                'Revision ' || coalesce(latest_document.revision_number, '')
              )::text
            ),
            true
          ),
          '{drawingRevisionNumber}',
          to_jsonb(coalesce(latest_document.revision_number, '')::text),
          true
        ),
        '{drawingFolderId}',
        to_jsonb(latest_document.folder_id::text),
        true
      ),
      updated_at = timezone('utc', now())
  where safety_form.form_type in (
      'scaffold-register',
      'handover-certificates',
      'day-labour-variations'
    )
    and nullif(btrim(safety_form.payload->>'drawingDocumentId'), '') is not null
    and exists (
      select 1
      from public.design_documents linked_document
      where linked_document.id::text = safety_form.payload->>'drawingDocumentId'
        and linked_document.folder_id = latest_document.folder_id
    )
    and (
      safety_form.payload->>'drawingDocumentId' is distinct from latest_document.id::text
      or safety_form.payload->>'drawingRevisionNumber' is distinct from coalesce(latest_document.revision_number, '')
      or safety_form.payload->>'drawingFolderId' is distinct from latest_document.folder_id::text
      or safety_form.payload->>'drawingDocumentName' is distinct from coalesce(
        case
          when safety_form.payload->>'drawingDocumentType' = 'thirdparty'
            and nullif(btrim(latest_document.third_party_design_path), '') is not null
            then latest_document.third_party_design_name
          when nullif(btrim(latest_document.ess_design_issue_path), '') is not null
            then latest_document.ess_design_issue_name
          else latest_document.third_party_design_name
        end,
        latest_document.description,
        'Revision ' || coalesce(latest_document.revision_number, '')
      )
    );

  return new;
end;
$$;

drop trigger if exists trg_sync_latest_design_revision_to_safety_forms
  on public.design_documents;

create trigger trg_sync_latest_design_revision_to_safety_forms
after insert or update of
  revision_number,
  ess_design_issue_path,
  ess_design_issue_name,
  third_party_design_path,
  third_party_design_name,
  description
on public.design_documents
for each row
execute function public.sync_latest_design_revision_to_safety_forms();

create or replace function public.sync_deleted_design_document_to_safety_forms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_document public.design_documents%rowtype;
begin
  select document.*
  into latest_document
  from public.design_documents document
  where document.folder_id = old.folder_id
    and (
      nullif(btrim(document.ess_design_issue_path), '') is not null
      or nullif(btrim(document.third_party_design_path), '') is not null
    )
  order by
    coalesce(
      nullif(substring(coalesce(document.revision_number, '') from '[0-9]+'), '')::integer,
      -1
    ) desc,
    document.updated_at desc,
    document.created_at desc
  limit 1;

  if latest_document.id is not null then
    update public.ess_safety_forms safety_form
    set payload = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  safety_form.payload - 'drawingUnavailable' - 'drawingUnavailableReason',
                  '{drawingDocumentId}',
                  to_jsonb(latest_document.id::text),
                  true
                ),
                '{drawingDocumentType}',
                to_jsonb(
                  case
                    when safety_form.payload->>'drawingDocumentType' = 'thirdparty'
                      and nullif(btrim(latest_document.third_party_design_path), '') is not null
                      then 'thirdparty'
                    when nullif(btrim(latest_document.ess_design_issue_path), '') is not null
                      then 'ess'
                    else 'thirdparty'
                  end::text
                ),
                true
              ),
              '{drawingDocumentName}',
              to_jsonb(
                coalesce(
                  case
                    when safety_form.payload->>'drawingDocumentType' = 'thirdparty'
                      and nullif(btrim(latest_document.third_party_design_path), '') is not null
                      then latest_document.third_party_design_name
                    when nullif(btrim(latest_document.ess_design_issue_path), '') is not null
                      then latest_document.ess_design_issue_name
                    else latest_document.third_party_design_name
                  end,
                  latest_document.description,
                  'Revision ' || coalesce(latest_document.revision_number, '')
                )::text
              ),
              true
            ),
            '{drawingRevisionNumber}',
            to_jsonb(coalesce(latest_document.revision_number, '')::text),
            true
          ),
          '{drawingFolderId}',
          to_jsonb(latest_document.folder_id::text),
          true
        ),
        updated_at = timezone('utc', now())
    where safety_form.form_type in (
        'scaffold-register',
        'handover-certificates',
        'day-labour-variations'
      )
      and (
        safety_form.payload->>'drawingDocumentId' = old.id::text
        or safety_form.payload->>'drawingFolderId' = old.folder_id::text
      );
  else
    update public.ess_safety_forms safety_form
    set payload = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    safety_form.payload,
                    '{drawingNumber}',
                    to_jsonb(''::text),
                    true
                  ),
                  '{drawingDocumentId}',
                  to_jsonb(''::text),
                  true
                ),
                '{drawingDocumentType}',
                to_jsonb(''::text),
                true
              ),
              '{drawingDocumentName}',
              to_jsonb(''::text),
              true
            ),
            '{drawingRevisionNumber}',
            to_jsonb(''::text),
            true
          ),
          '{drawingUnavailable}',
          'true'::jsonb,
          true
        ) || jsonb_build_object(
          'drawingUnavailableReason',
          'The linked drawing was removed from the ESS Design register.'
        ),
        reference_number = case
          when safety_form.form_type = 'scaffold-register' then ''
          else safety_form.reference_number
        end,
        updated_at = timezone('utc', now())
    where safety_form.form_type in (
        'scaffold-register',
        'handover-certificates',
        'day-labour-variations'
      )
      and (
        safety_form.payload->>'drawingDocumentId' = old.id::text
        or safety_form.payload->>'drawingFolderId' = old.folder_id::text
      );
  end if;

  return old;
end;
$$;

drop trigger if exists trg_sync_deleted_design_document_to_safety_forms
  on public.design_documents;

create trigger trg_sync_deleted_design_document_to_safety_forms
after delete on public.design_documents
for each row
execute function public.sync_deleted_design_document_to_safety_forms();

revoke all on function public.sync_latest_design_revision_to_safety_forms()
  from public, anon, authenticated;
revoke all on function public.sync_deleted_design_document_to_safety_forms()
  from public, anon, authenticated;

commit;
