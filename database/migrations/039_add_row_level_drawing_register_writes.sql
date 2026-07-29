-- Adds row-level Drawing Register writes without replacing the existing register.
-- Existing builders, projects, drawing entries, revisions, and legacy backup data
-- are preserved unchanged.

begin;

create or replace function public.ess_apply_drawing_register_change(
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_entry_id text;
  v_builder_id text;
  v_project_id text;
  v_previous_project_id text;
  v_project_builder_id text;
  v_affected_project_ids text[] := '{}'::text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('ess-site-registry-write', 0));

  if not (
    select legacy_imported_at is not null
    from public.ess_site_registry_meta
    where singleton = true
  ) then
    raise exception 'SITE_REGISTRY_NOT_IMPORTED: legacy projects.json must be imported before changes are accepted';
  end if;

  p_operation := lower(btrim(coalesce(p_operation, '')));
  p_payload := coalesce(p_payload, '{}'::jsonb);

  if p_operation in ('upsert_drawing_entry', 'upsert_drawing_entries') then
    if p_operation = 'upsert_drawing_entry' then
      if jsonb_typeof(p_payload->'entry') <> 'object' then
        raise exception 'SITE_REGISTRY_INVALID: A Drawing Register entry is required';
      end if;
      p_payload := jsonb_build_object('entries', jsonb_build_array(p_payload->'entry'));
    elsif jsonb_typeof(p_payload->'entries') <> 'array' then
      raise exception 'SITE_REGISTRY_INVALID: Drawing Register entries must be an array';
    end if;

    for v_entry in
      select value
      from jsonb_array_elements(p_payload->'entries')
    loop
      v_entry_id := btrim(coalesce(v_entry->>'id', ''));
      if v_entry_id = '' then
        raise exception 'SITE_REGISTRY_INVALID: Every Drawing Register entry requires an ID';
      end if;

      v_builder_id := nullif(btrim(coalesce(v_entry->>'builderId', '')), '');
      v_project_id := nullif(btrim(coalesce(v_entry->>'projectId', '')), '');
      v_previous_project_id := null;
      v_project_builder_id := null;

      select project_id
      into v_previous_project_id
      from public.ess_drawing_register_entries
      where id = v_entry_id;

      if v_project_id is not null then
        select builder_id
        into v_project_builder_id
        from public.ess_site_projects
        where id = v_project_id;

        if v_project_builder_id is null then
          raise exception 'SITE_REGISTRY_NOT_FOUND: Drawing Register project not found';
        end if;
        if v_builder_id is not null and v_builder_id <> v_project_builder_id then
          raise exception 'SITE_REGISTRY_INVALID: Drawing Register project does not belong to the selected builder';
        end if;
        v_builder_id := v_project_builder_id;
      elsif v_builder_id is not null
        and not exists (
          select 1 from public.ess_site_builders where id = v_builder_id
        ) then
        raise exception 'SITE_REGISTRY_NOT_FOUND: Drawing Register builder not found';
      end if;

      insert into public.ess_drawing_register_entries (
        id,
        builder_id,
        project_id,
        client,
        project,
        design,
        drawing_no,
        date_issued,
        revision_no,
        design_use,
        sort_order
      )
      values (
        v_entry_id,
        v_builder_id,
        v_project_id,
        coalesce(v_entry->>'client', ''),
        coalesce(v_entry->>'project', ''),
        coalesce(v_entry->>'design', ''),
        coalesce(v_entry->>'drawingNo', ''),
        coalesce(v_entry->>'dateIssued', ''),
        coalesce(v_entry->>'revisionNo', ''),
        coalesce(v_entry->>'designUse', ''),
        coalesce(
          nullif(v_entry->>'sortOrder', '')::integer,
          (
            select coalesce(max(sort_order), -1) + 1
            from public.ess_drawing_register_entries
          )
        )
      )
      on conflict (id) do update set
        builder_id = excluded.builder_id,
        project_id = excluded.project_id,
        client = excluded.client,
        project = excluded.project,
        design = excluded.design,
        drawing_no = excluded.drawing_no,
        date_issued = excluded.date_issued,
        revision_no = excluded.revision_no,
        design_use = excluded.design_use,
        updated_at = timezone('utc', now());

      if v_previous_project_id is not null then
        v_affected_project_ids := array_append(
          v_affected_project_ids,
          v_previous_project_id
        );
      end if;
      if v_project_id is not null then
        v_affected_project_ids := array_append(
          v_affected_project_ids,
          v_project_id
        );
      end if;
    end loop;

  elsif p_operation = 'delete_drawing_entry' then
    v_entry_id := btrim(coalesce(p_payload->>'entryId', ''));
    if v_entry_id = '' then
      raise exception 'SITE_REGISTRY_INVALID: A Drawing Register entry ID is required';
    end if;

    select project_id
    into v_previous_project_id
    from public.ess_drawing_register_entries
    where id = v_entry_id;

    delete from public.ess_drawing_register_entries
    where id = v_entry_id;
    if not found then
      raise exception 'SITE_REGISTRY_NOT_FOUND: Drawing Register entry not found';
    end if;

    if v_previous_project_id is not null then
      v_affected_project_ids := array_append(
        v_affected_project_ids,
        v_previous_project_id
      );
    end if;

  else
    raise exception 'SITE_REGISTRY_INVALID: Unsupported Drawing Register operation "%"', p_operation;
  end if;

  for v_project_id in
    select distinct affected_project_id
    from unnest(v_affected_project_ids) as affected_project_id
    where affected_project_id is not null
  loop
    update public.ess_site_projects p
    set drawing_numbers = coalesce((
          select array_agg(
            distinct substring(
              upper(d.drawing_no)
              from '^[A-Z0-9]+-[A-Z0-9]+-ESD[0-9]+'
            )
          )
          from public.ess_drawing_register_entries d
          where d.project_id = p.id
            and d.drawing_no ~* '^[A-Z0-9]+-[A-Z0-9]+-ESD[0-9]+'
        ), '{}'::text[]),
        updated_at = timezone('utc', now())
    where p.id = v_project_id;

    select builder_id
    into v_builder_id
    from public.ess_site_projects
    where id = v_project_id;

    if v_builder_id is not null then
      update public.ess_site_builders
      set updated_at = timezone('utc', now())
      where id = v_builder_id;
    end if;
  end loop;

  update public.ess_site_registry_meta
  set revision = revision + 1,
      drawing_revision = drawing_revision + 1,
      updated_at = timezone('utc', now())
  where singleton = true;

  return public.ess_get_site_registry(true);
exception
  when unique_violation then
    raise exception 'SITE_REGISTRY_CONFLICT: A Drawing Register entry with that ID already exists';
end;
$$;

revoke all on function public.ess_apply_drawing_register_change(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ess_apply_drawing_register_change(text, jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
