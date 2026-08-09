-- Preserve Safety form metadata for the Project Data registers before a form
-- is permanently removed by either the web application or the iOS app.

create table if not exists public.ess_deleted_safety_forms (
  archive_id bigint generated always as identity primary key,
  form_type text not null check (
    form_type in (
      'scaff-tags',
      'handover-certificates',
      'day-labour-variations'
    )
  ),
  id text not null,
  builder_id text not null,
  project_id text not null,
  builder_name text not null default '',
  project_name text not null default '',
  title text not null default '',
  reference_number text not null default '',
  requested_by text not null default '',
  project_label text not null default '',
  event_date text not null default '',
  pdf_path text not null default '',
  share_path text not null default '',
  photo_paths text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  created_by_user_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_by_user_id text,
  deleted_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_deleted_safety_forms_kind_deleted_idx
  on public.ess_deleted_safety_forms (form_type, deleted_at desc);

create index if not exists ess_deleted_safety_forms_project_kind_idx
  on public.ess_deleted_safety_forms (
    builder_id,
    project_id,
    form_type,
    deleted_at desc
  );

create or replace function public.archive_deleted_safety_form()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_builder_name text := '';
  archived_project_name text := '';
begin
  select coalesce(builder.name, ''), coalesce(project.name, '')
    into archived_builder_name, archived_project_name
  from public.ess_site_projects project
  join public.ess_site_builders builder
    on builder.id = project.builder_id
  where project.id = old.project_id
    and project.builder_id = old.builder_id
  limit 1;

  insert into public.ess_deleted_safety_forms (
    form_type,
    id,
    builder_id,
    project_id,
    builder_name,
    project_name,
    title,
    reference_number,
    requested_by,
    project_label,
    event_date,
    pdf_path,
    share_path,
    photo_paths,
    payload,
    created_by_user_id,
    created_at,
    updated_at,
    deleted_by_user_id,
    deleted_at
  ) values (
    old.form_type,
    old.id,
    old.builder_id,
    old.project_id,
    coalesce(archived_builder_name, ''),
    coalesce(archived_project_name, ''),
    old.title,
    old.reference_number,
    old.requested_by,
    old.project_label,
    old.event_date,
    old.pdf_path,
    old.share_path,
    old.photo_paths,
    old.payload,
    old.created_by_user_id,
    old.created_at,
    old.updated_at,
    coalesce(auth.uid()::text, old.created_by_user_id),
    timezone('utc', now())
  );
  return old;
end;
$$;

drop trigger if exists trg_archive_deleted_safety_form
  on public.ess_safety_forms;
create trigger trg_archive_deleted_safety_form
after delete on public.ess_safety_forms
for each row
execute function public.archive_deleted_safety_form();

alter table public.ess_deleted_safety_forms enable row level security;

revoke all on table public.ess_deleted_safety_forms from public, anon;
grant select on table public.ess_deleted_safety_forms to authenticated;
grant all on table public.ess_deleted_safety_forms to service_role;

drop policy if exists "deleted_safety_forms_authenticated_select"
  on public.ess_deleted_safety_forms;
create policy "deleted_safety_forms_authenticated_select"
on public.ess_deleted_safety_forms
for select
to authenticated
using (true);
