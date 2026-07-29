-- Migration: Move the shared Site Registry from projects.json to relational tables
-- Run this migration before deploying the matching API/client release.
--
-- The application imports project-information/projects.json automatically on the
-- first Site Registry request after this migration is installed. Existing text IDs
-- are preserved because they are part of storage paths and downstream records.

begin;

create table if not exists public.ess_site_registry_meta (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0,
  drawing_revision bigint not null default 0,
  legacy_imported_at timestamptz,
  legacy_source_updated_at timestamptz,
  legacy_backup jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.ess_site_registry_meta (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.ess_site_builders (
  id text primary key,
  name text not null check (length(btrim(name)) > 0),
  logo_url text not null default '',
  logo_path text not null default '',
  design_folder_id text not null default '',
  design_folder_path text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists ess_site_builders_name_unique_idx
  on public.ess_site_builders (lower(btrim(name)));

create table if not exists public.ess_site_projects (
  id text primary key,
  builder_id text not null references public.ess_site_builders(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  archived boolean not null default false,
  archived_at timestamptz,
  site_location text not null default '',
  design_folder_id text not null default '',
  design_folder_path text not null default '',
  scaffold_entity text not null default 'Erect Safe Scaffolding',
  project_manager_user_id text not null default '',
  site_supervisor_user_id text not null default '',
  leading_hand_user_id text not null default '',
  project_manager_employee_id text not null default '',
  site_supervisor_employee_id text not null default '',
  leading_hand_employee_id text not null default '',
  drawing_numbers text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists ess_site_projects_builder_name_unique_idx
  on public.ess_site_projects (builder_id, lower(btrim(name)));

create index if not exists ess_site_projects_builder_idx
  on public.ess_site_projects (builder_id);

create index if not exists ess_site_projects_active_idx
  on public.ess_site_projects (archived, builder_id, name);

create table if not exists public.ess_site_project_inductees (
  project_id text not null references public.ess_site_projects(id) on delete cascade,
  employee_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (project_id, employee_id)
);

create index if not exists ess_site_project_inductees_employee_idx
  on public.ess_site_project_inductees (employee_id);

create table if not exists public.ess_drawing_register_entries (
  id text primary key,
  builder_id text,
  project_id text,
  client text not null default '',
  project text not null default '',
  design text not null default '',
  drawing_no text not null default '',
  date_issued text not null default '',
  revision_no text not null default '',
  design_use text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_drawing_register_entries_project_idx
  on public.ess_drawing_register_entries (project_id);

create index if not exists ess_drawing_register_entries_sort_idx
  on public.ess_drawing_register_entries (sort_order, id);

alter table public.ess_site_registry_meta enable row level security;
alter table public.ess_site_builders enable row level security;
alter table public.ess_site_projects enable row level security;
alter table public.ess_site_project_inductees enable row level security;
alter table public.ess_drawing_register_entries enable row level security;

revoke all on table public.ess_site_registry_meta from public, anon, authenticated;
revoke all on table public.ess_site_builders from public, anon, authenticated;
revoke all on table public.ess_site_projects from public, anon, authenticated;
revoke all on table public.ess_site_project_inductees from public, anon, authenticated;
revoke all on table public.ess_drawing_register_entries from public, anon, authenticated;

grant all on table public.ess_site_registry_meta to service_role;
grant all on table public.ess_site_builders to service_role;
grant all on table public.ess_site_projects to service_role;
grant all on table public.ess_site_project_inductees to service_role;
grant all on table public.ess_drawing_register_entries to service_role;

create or replace function public.ess_get_site_registry(
  p_include_archived boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'builders',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'logoUrl', b.logo_url,
          'logoPath', b.logo_path,
          'designFolderId', b.design_folder_id,
          'designFolderPath', b.design_folder_path,
          'projects', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'archived', p.archived,
                'archivedAt', p.archived_at,
                'siteLocation', p.site_location,
                'designFolderId', p.design_folder_id,
                'designFolderPath', p.design_folder_path,
                'scaffoldEntity', p.scaffold_entity,
                'projectManagerUserId', p.project_manager_user_id,
                'siteSupervisorUserId', p.site_supervisor_user_id,
                'leadingHandUserId', p.leading_hand_user_id,
                'projectManagerEmployeeId', p.project_manager_employee_id,
                'siteSupervisorEmployeeId', p.site_supervisor_employee_id,
                'leadingHandEmployeeId', p.leading_hand_employee_id,
                'inductedEmployeeIds', coalesce((
                  select jsonb_agg(i.employee_id order by i.employee_id)
                  from public.ess_site_project_inductees i
                  where i.project_id = p.id
                ), '[]'::jsonb),
                'drawingNumbers', to_jsonb(p.drawing_numbers),
                'createdAt', p.created_at,
                'updatedAt', p.updated_at
              )
              order by lower(p.name), p.id
            )
            from public.ess_site_projects p
            where p.builder_id = b.id
              and (p_include_archived or not p.archived)
          ), '[]'::jsonb),
          'createdAt', b.created_at,
          'updatedAt', b.updated_at
        )
        order by lower(b.name), b.id
      )
      from public.ess_site_builders b
    ), '[]'::jsonb),
    'drawingRegisterEntries',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'builderId', coalesce(d.builder_id, ''),
          'projectId', coalesce(d.project_id, ''),
          'client', d.client,
          'project', d.project,
          'design', d.design,
          'drawingNo', d.drawing_no,
          'dateIssued', d.date_issued,
          'revisionNo', d.revision_no,
          'designUse', d.design_use
        )
        order by d.sort_order, d.id
      )
      from public.ess_drawing_register_entries d
    ), '[]'::jsonb),
    'revision', m.revision,
    'drawingRevision', m.drawing_revision,
    'migrationCompleted', (m.legacy_imported_at is not null),
    'updatedAt', m.updated_at
  )
  from public.ess_site_registry_meta m
  where m.singleton = true;
$$;

create or replace function public.ess_import_site_registry(
  p_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_builder jsonb;
  v_project jsonb;
  v_entry jsonb;
  v_employee_id text;
  v_builder_id text;
  v_project_id text;
  v_inductees jsonb;
  v_drawings jsonb;
  v_sort_order integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ess-site-registry-write', 0));

  if (select legacy_imported_at is not null from public.ess_site_registry_meta where singleton = true) then
    return public.ess_get_site_registry(true);
  end if;

  if p_document is null
     or jsonb_typeof(p_document) <> 'object'
     or jsonb_typeof(p_document->'builders') <> 'array' then
    raise exception 'SITE_REGISTRY_INVALID: projects.json does not contain a builders array';
  end if;

  for v_builder in
    select value from jsonb_array_elements(p_document->'builders')
  loop
    v_builder_id := nullif(btrim(v_builder->>'id'), '');
    if v_builder_id is null then
      raise exception 'SITE_REGISTRY_INVALID: a builder is missing its existing id';
    end if;

    insert into public.ess_site_builders (
      id, name, logo_url, logo_path, design_folder_id, design_folder_path, created_at, updated_at
    )
    values (
      v_builder_id,
      btrim(v_builder->>'name'),
      coalesce(v_builder->>'logoUrl', v_builder->>'logo_url', ''),
      coalesce(v_builder->>'logoPath', v_builder->>'logo_path', ''),
      coalesce(v_builder->>'designFolderId', v_builder->>'design_folder_id', ''),
      coalesce(v_builder->>'designFolderPath', v_builder->>'design_folder_path', ''),
      coalesce(nullif(v_builder->>'createdAt', '')::timestamptz, timezone('utc', now())),
      coalesce(nullif(v_builder->>'updatedAt', '')::timestamptz, timezone('utc', now()))
    )
    on conflict (id) do update set
      name = excluded.name,
      logo_url = excluded.logo_url,
      logo_path = excluded.logo_path,
      design_folder_id = excluded.design_folder_id,
      design_folder_path = excluded.design_folder_path,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

    if jsonb_typeof(v_builder->'projects') = 'array' then
      for v_project in
        select value from jsonb_array_elements(v_builder->'projects')
      loop
        v_project_id := nullif(btrim(v_project->>'id'), '');
        if v_project_id is null then
          raise exception 'SITE_REGISTRY_INVALID: project "%" is missing its existing id', v_project->>'name';
        end if;

        v_drawings := coalesce(v_project->'drawingNumbers', v_project->'drawing_numbers', '[]'::jsonb);

        insert into public.ess_site_projects (
          id, builder_id, name, archived, archived_at, site_location,
          design_folder_id, design_folder_path, scaffold_entity,
          project_manager_user_id, site_supervisor_user_id, leading_hand_user_id,
          project_manager_employee_id, site_supervisor_employee_id, leading_hand_employee_id,
          drawing_numbers, created_at, updated_at
        )
        values (
          v_project_id,
          v_builder_id,
          btrim(v_project->>'name'),
          coalesce((v_project->>'archived')::boolean, false),
          nullif(v_project->>'archivedAt', '')::timestamptz,
          coalesce(v_project->>'siteLocation', v_project->>'site_location', ''),
          coalesce(v_project->>'designFolderId', v_project->>'design_folder_id', ''),
          coalesce(v_project->>'designFolderPath', v_project->>'design_folder_path', ''),
          coalesce(nullif(v_project->>'scaffoldEntity', ''), nullif(v_project->>'scaffold_entity', ''), 'Erect Safe Scaffolding'),
          coalesce(v_project->>'projectManagerUserId', v_project->>'project_manager_user_id', ''),
          coalesce(v_project->>'siteSupervisorUserId', v_project->>'site_supervisor_user_id', ''),
          coalesce(v_project->>'leadingHandUserId', v_project->>'leading_hand_user_id', ''),
          coalesce(v_project->>'projectManagerEmployeeId', v_project->>'project_manager_employee_id', ''),
          coalesce(v_project->>'siteSupervisorEmployeeId', v_project->>'site_supervisor_employee_id', ''),
          coalesce(v_project->>'leadingHandEmployeeId', v_project->>'leading_hand_employee_id', ''),
          case when jsonb_typeof(v_drawings) = 'array'
            then array(select distinct upper(btrim(value)) from jsonb_array_elements_text(v_drawings) where btrim(value) <> '')
            else '{}'::text[]
          end,
          coalesce(nullif(v_project->>'createdAt', '')::timestamptz, timezone('utc', now())),
          coalesce(nullif(v_project->>'updatedAt', '')::timestamptz, timezone('utc', now()))
        )
        on conflict (id) do update set
          builder_id = excluded.builder_id,
          name = excluded.name,
          archived = excluded.archived,
          archived_at = excluded.archived_at,
          site_location = excluded.site_location,
          design_folder_id = excluded.design_folder_id,
          design_folder_path = excluded.design_folder_path,
          scaffold_entity = excluded.scaffold_entity,
          project_manager_user_id = excluded.project_manager_user_id,
          site_supervisor_user_id = excluded.site_supervisor_user_id,
          leading_hand_user_id = excluded.leading_hand_user_id,
          project_manager_employee_id = excluded.project_manager_employee_id,
          site_supervisor_employee_id = excluded.site_supervisor_employee_id,
          leading_hand_employee_id = excluded.leading_hand_employee_id,
          drawing_numbers = excluded.drawing_numbers,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at;

        v_inductees := coalesce(v_project->'inductedEmployeeIds', v_project->'inducted_employee_ids', '[]'::jsonb);
        if jsonb_typeof(v_inductees) = 'array' then
          for v_employee_id in select distinct btrim(value) from jsonb_array_elements_text(v_inductees)
          loop
            if v_employee_id <> '' then
              insert into public.ess_site_project_inductees (project_id, employee_id)
              values (v_project_id, v_employee_id)
              on conflict (project_id, employee_id) do nothing;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end loop;

  if jsonb_typeof(p_document->'drawingRegisterEntries') = 'array' then
    for v_entry, v_sort_order in
      select value, (ordinality - 1)::integer
      from jsonb_array_elements(p_document->'drawingRegisterEntries') with ordinality
    loop
      insert into public.ess_drawing_register_entries (
        id, builder_id, project_id, client, project, design, drawing_no,
        date_issued, revision_no, design_use, sort_order
      )
      values (
        coalesce(nullif(v_entry->>'id', ''), 'drawing-' || v_sort_order::text),
        nullif(v_entry->>'builderId', ''),
        nullif(v_entry->>'projectId', ''),
        coalesce(v_entry->>'client', ''),
        coalesce(v_entry->>'project', ''),
        coalesce(v_entry->>'design', ''),
        coalesce(v_entry->>'drawingNo', ''),
        coalesce(v_entry->>'dateIssued', ''),
        coalesce(v_entry->>'revisionNo', ''),
        coalesce(v_entry->>'designUse', ''),
        v_sort_order
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
        sort_order = excluded.sort_order,
        updated_at = timezone('utc', now());
    end loop;
  end if;

  update public.ess_site_registry_meta
  set legacy_imported_at = timezone('utc', now()),
      legacy_source_updated_at = nullif(p_document->>'updatedAt', '')::timestamptz,
      legacy_backup = p_document,
      revision = revision + 1,
      drawing_revision = drawing_revision + 1,
      updated_at = timezone('utc', now())
  where singleton = true;

  return public.ess_get_site_registry(true);
end;
$$;

create or replace function public.ess_apply_site_registry_change(
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_builder jsonb;
  v_project jsonb;
  v_entry jsonb;
  v_link jsonb;
  v_employee_id text;
  v_builder_id text;
  v_project_id text;
  v_existing_builder_id text;
  v_expected_drawing_revision bigint;
  v_current_drawing_revision bigint;
  v_sort_order integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ess-site-registry-write', 0));

  if not (select legacy_imported_at is not null from public.ess_site_registry_meta where singleton = true) then
    raise exception 'SITE_REGISTRY_NOT_IMPORTED: legacy projects.json must be imported before changes are accepted';
  end if;

  p_operation := lower(btrim(coalesce(p_operation, '')));
  p_payload := coalesce(p_payload, '{}'::jsonb);

  if p_operation = 'create_builder' then
    v_builder := p_payload->'builder';
    if exists (
      select 1 from public.ess_site_builders
      where lower(btrim(name)) = lower(btrim(v_builder->>'name'))
    ) then
      raise exception 'SITE_REGISTRY_CONFLICT: A builder with that name already exists';
    end if;

    insert into public.ess_site_builders (
      id, name, logo_url, logo_path, design_folder_id, design_folder_path, created_at, updated_at
    ) values (
      v_builder->>'id',
      btrim(v_builder->>'name'),
      coalesce(v_builder->>'logoUrl', ''),
      coalesce(v_builder->>'logoPath', ''),
      coalesce(v_builder->>'designFolderId', ''),
      coalesce(v_builder->>'designFolderPath', ''),
      coalesce(nullif(v_builder->>'createdAt', '')::timestamptz, timezone('utc', now())),
      timezone('utc', now())
    );

  elsif p_operation = 'create_builder_and_project' then
    v_builder := p_payload->'builder';
    v_project := p_payload->'project';
    select id into v_existing_builder_id
    from public.ess_site_builders
    where lower(btrim(name)) = lower(btrim(v_builder->>'name'));

    if v_existing_builder_id is null then
      v_existing_builder_id := v_builder->>'id';
      insert into public.ess_site_builders (id, name, created_at, updated_at)
      values (
        v_existing_builder_id,
        btrim(v_builder->>'name'),
        coalesce(nullif(v_builder->>'createdAt', '')::timestamptz, timezone('utc', now())),
        timezone('utc', now())
      );
    end if;

    if exists (
      select 1 from public.ess_site_projects
      where builder_id = v_existing_builder_id
        and lower(btrim(name)) = lower(btrim(v_project->>'name'))
    ) then
      raise exception 'SITE_REGISTRY_CONFLICT: This project already exists under that builder';
    end if;

    insert into public.ess_site_projects (id, builder_id, name, scaffold_entity, created_at, updated_at)
    values (
      v_project->>'id',
      v_existing_builder_id,
      btrim(v_project->>'name'),
      coalesce(nullif(v_project->>'scaffoldEntity', ''), 'Erect Safe Scaffolding'),
      coalesce(nullif(v_project->>'createdAt', '')::timestamptz, timezone('utc', now())),
      timezone('utc', now())
    );

  elsif p_operation = 'update_builder' then
    v_builder_id := p_payload->>'builderId';
    if exists (
      select 1 from public.ess_site_builders
      where id <> v_builder_id
        and lower(btrim(name)) = lower(btrim(p_payload->>'name'))
    ) then
      raise exception 'SITE_REGISTRY_CONFLICT: A builder with that name already exists';
    end if;

    update public.ess_site_builders
    set name = btrim(p_payload->>'name'),
        logo_url = coalesce(p_payload->>'logoUrl', ''),
        logo_path = coalesce(p_payload->>'logoPath', ''),
        design_folder_id = coalesce(p_payload->>'designFolderId', ''),
        design_folder_path = coalesce(p_payload->>'designFolderPath', ''),
        updated_at = timezone('utc', now())
    where id = v_builder_id;
    if not found then
      raise exception 'SITE_REGISTRY_NOT_FOUND: Builder not found';
    end if;

  elsif p_operation = 'delete_builder' then
    v_builder_id := p_payload->>'builderId';
    if exists (select 1 from public.ess_site_projects where builder_id = v_builder_id) then
      raise exception 'SITE_REGISTRY_CONFLICT: This builder still has projects attached. Remove those first.';
    end if;
    delete from public.ess_site_builders where id = v_builder_id;
    if not found then
      raise exception 'SITE_REGISTRY_NOT_FOUND: Builder not found';
    end if;

  elsif p_operation = 'create_project' then
    v_project := p_payload->'project';
    v_builder_id := v_project->>'builderId';
    if not exists (select 1 from public.ess_site_builders where id = v_builder_id) then
      raise exception 'SITE_REGISTRY_NOT_FOUND: Builder not found';
    end if;
    if exists (
      select 1 from public.ess_site_projects
      where builder_id = v_builder_id
        and lower(btrim(name)) = lower(btrim(v_project->>'name'))
    ) then
      raise exception 'SITE_REGISTRY_CONFLICT: A project with that name already exists under this builder';
    end if;

    insert into public.ess_site_projects (
      id, builder_id, name, site_location, design_folder_id, design_folder_path,
      scaffold_entity, project_manager_user_id, site_supervisor_user_id,
      leading_hand_user_id, project_manager_employee_id,
      site_supervisor_employee_id, leading_hand_employee_id, created_at, updated_at
    ) values (
      v_project->>'id',
      v_builder_id,
      btrim(v_project->>'name'),
      coalesce(v_project->>'siteLocation', ''),
      coalesce(v_project->>'designFolderId', ''),
      coalesce(v_project->>'designFolderPath', ''),
      coalesce(nullif(v_project->>'scaffoldEntity', ''), 'Erect Safe Scaffolding'),
      coalesce(v_project->>'projectManagerUserId', ''),
      coalesce(v_project->>'siteSupervisorUserId', ''),
      coalesce(v_project->>'leadingHandUserId', ''),
      coalesce(v_project->>'projectManagerEmployeeId', ''),
      coalesce(v_project->>'siteSupervisorEmployeeId', ''),
      coalesce(v_project->>'leadingHandEmployeeId', ''),
      coalesce(nullif(v_project->>'createdAt', '')::timestamptz, timezone('utc', now())),
      timezone('utc', now())
    );

    if jsonb_typeof(v_project->'inductedEmployeeIds') = 'array' then
      for v_employee_id in select distinct btrim(value) from jsonb_array_elements_text(v_project->'inductedEmployeeIds')
      loop
        if v_employee_id <> '' then
          insert into public.ess_site_project_inductees (project_id, employee_id)
          values (v_project->>'id', v_employee_id)
          on conflict (project_id, employee_id) do nothing;
        end if;
      end loop;
    end if;

    update public.ess_site_builders
    set updated_at = timezone('utc', now())
    where id = v_builder_id;

  elsif p_operation = 'update_project' then
    v_project := p_payload->'project';
    v_builder_id := v_project->>'builderId';
    v_project_id := v_project->>'id';
    if exists (
      select 1 from public.ess_site_projects
      where builder_id = v_builder_id
        and id <> v_project_id
        and lower(btrim(name)) = lower(btrim(v_project->>'name'))
    ) then
      raise exception 'SITE_REGISTRY_CONFLICT: A project with that name already exists under this builder';
    end if;

    update public.ess_site_projects
    set name = btrim(v_project->>'name'),
        site_location = coalesce(v_project->>'siteLocation', ''),
        design_folder_id = coalesce(v_project->>'designFolderId', ''),
        design_folder_path = coalesce(v_project->>'designFolderPath', ''),
        scaffold_entity = coalesce(nullif(v_project->>'scaffoldEntity', ''), 'Erect Safe Scaffolding'),
        project_manager_user_id = coalesce(v_project->>'projectManagerUserId', ''),
        site_supervisor_user_id = coalesce(v_project->>'siteSupervisorUserId', ''),
        leading_hand_user_id = coalesce(v_project->>'leadingHandUserId', ''),
        project_manager_employee_id = coalesce(v_project->>'projectManagerEmployeeId', ''),
        site_supervisor_employee_id = coalesce(v_project->>'siteSupervisorEmployeeId', ''),
        leading_hand_employee_id = coalesce(v_project->>'leadingHandEmployeeId', ''),
        updated_at = timezone('utc', now())
    where id = v_project_id and builder_id = v_builder_id;
    if not found then
      raise exception 'SITE_REGISTRY_NOT_FOUND: Project not found';
    end if;

    delete from public.ess_site_project_inductees where project_id = v_project_id;
    if jsonb_typeof(v_project->'inductedEmployeeIds') = 'array' then
      for v_employee_id in select distinct btrim(value) from jsonb_array_elements_text(v_project->'inductedEmployeeIds')
      loop
        if v_employee_id <> '' then
          insert into public.ess_site_project_inductees (project_id, employee_id)
          values (v_project_id, v_employee_id)
          on conflict (project_id, employee_id) do nothing;
        end if;
      end loop;
    end if;

    update public.ess_site_builders
    set updated_at = timezone('utc', now())
    where id = v_builder_id;

  elsif p_operation = 'delete_project' then
    v_builder_id := p_payload->>'builderId';
    v_project_id := p_payload->>'projectId';
    delete from public.ess_site_projects
    where id = v_project_id and builder_id = v_builder_id;
    if not found then
      raise exception 'SITE_REGISTRY_NOT_FOUND: Project not found';
    end if;
    update public.ess_site_builders
    set updated_at = timezone('utc', now())
    where id = v_builder_id;

  elsif p_operation = 'set_project_archived' then
    v_builder_id := p_payload->>'builderId';
    v_project_id := p_payload->>'projectId';
    update public.ess_site_projects
    set archived = coalesce((p_payload->>'archived')::boolean, false),
        archived_at = case when coalesce((p_payload->>'archived')::boolean, false)
          then timezone('utc', now()) else null end,
        updated_at = timezone('utc', now())
    where id = v_project_id and builder_id = v_builder_id;
    if not found then
      raise exception 'SITE_REGISTRY_NOT_FOUND: Project not found';
    end if;
    update public.ess_site_builders
    set updated_at = timezone('utc', now())
    where id = v_builder_id;

  elsif p_operation = 'update_folder_links' then
    if jsonb_typeof(p_payload->'builders') = 'array' then
      for v_link in select value from jsonb_array_elements(p_payload->'builders')
      loop
        update public.ess_site_builders
        set design_folder_id = coalesce(v_link->>'designFolderId', ''),
            design_folder_path = coalesce(v_link->>'designFolderPath', ''),
            updated_at = timezone('utc', now())
        where id = v_link->>'id';
      end loop;
    end if;
    if jsonb_typeof(p_payload->'projects') = 'array' then
      for v_link in select value from jsonb_array_elements(p_payload->'projects')
      loop
        update public.ess_site_projects
        set design_folder_id = coalesce(v_link->>'designFolderId', ''),
            design_folder_path = coalesce(v_link->>'designFolderPath', ''),
            updated_at = timezone('utc', now())
        where id = v_link->>'id';
      end loop;
    end if;

  elsif p_operation = 'replace_drawing_register' then
    v_expected_drawing_revision := nullif(p_payload->>'expectedDrawingRevision', '')::bigint;
    select drawing_revision into v_current_drawing_revision
    from public.ess_site_registry_meta where singleton = true for update;
    if v_expected_drawing_revision is not null
       and v_expected_drawing_revision <> v_current_drawing_revision then
      raise exception 'SITE_REGISTRY_CONFLICT: The Drawing Register changed in another session. Reload before saving again.';
    end if;

    delete from public.ess_drawing_register_entries;
    if jsonb_typeof(p_payload->'entries') = 'array' then
      for v_entry, v_sort_order in
        select value, (ordinality - 1)::integer
        from jsonb_array_elements(p_payload->'entries') with ordinality
      loop
        insert into public.ess_drawing_register_entries (
          id, builder_id, project_id, client, project, design, drawing_no,
          date_issued, revision_no, design_use, sort_order
        ) values (
          coalesce(nullif(v_entry->>'id', ''), 'drawing-' || v_sort_order::text),
          nullif(v_entry->>'builderId', ''),
          nullif(v_entry->>'projectId', ''),
          coalesce(v_entry->>'client', ''),
          coalesce(v_entry->>'project', ''),
          coalesce(v_entry->>'design', ''),
          coalesce(v_entry->>'drawingNo', ''),
          coalesce(v_entry->>'dateIssued', ''),
          coalesce(v_entry->>'revisionNo', ''),
          coalesce(v_entry->>'designUse', ''),
          v_sort_order
        );
      end loop;
    end if;

    update public.ess_site_projects set drawing_numbers = '{}'::text[];
    with project_numbers as (
      select
        project_id,
        array_agg(distinct substring(upper(drawing_no) from '^[A-Z0-9]+-[A-Z0-9]+-ESD[0-9]+'))
          filter (where drawing_no ~* '^[A-Z0-9]+-[A-Z0-9]+-ESD[0-9]+') as drawing_numbers
      from public.ess_drawing_register_entries
      where project_id is not null
      group by project_id
    )
    update public.ess_site_projects p
    set drawing_numbers = coalesce(n.drawing_numbers, '{}'::text[]),
        updated_at = timezone('utc', now())
    from project_numbers n
    where p.id = n.project_id;

    update public.ess_site_builders b
    set updated_at = timezone('utc', now())
    where exists (
      select 1 from public.ess_site_projects p
      where p.builder_id = b.id and cardinality(p.drawing_numbers) > 0
    );

  else
    raise exception 'SITE_REGISTRY_INVALID: Unsupported operation "%"', p_operation;
  end if;

  update public.ess_site_registry_meta
  set revision = revision + 1,
      drawing_revision = drawing_revision + case when p_operation = 'replace_drawing_register' then 1 else 0 end,
      updated_at = timezone('utc', now())
  where singleton = true;

  return public.ess_get_site_registry(true);
exception
  when unique_violation then
    raise exception 'SITE_REGISTRY_CONFLICT: A record with that name or ID already exists';
end;
$$;

revoke all on function public.ess_get_site_registry(boolean) from public, anon, authenticated;
revoke all on function public.ess_import_site_registry(jsonb) from public, anon, authenticated;
revoke all on function public.ess_apply_site_registry_change(text, jsonb) from public, anon, authenticated;

grant execute on function public.ess_get_site_registry(boolean) to service_role;
grant execute on function public.ess_import_site_registry(jsonb) to service_role;
grant execute on function public.ess_apply_site_registry_change(text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
