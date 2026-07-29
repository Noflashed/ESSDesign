-- Relational cutover for ESS Safety project data.
--
-- Existing JSON objects are intentionally not imported. They remain untouched in
-- Supabase Storage as a recoverable development backup, while the application
-- starts with clean relational Safety records. PDFs, photos, and generated share
-- files remain in object storage; their searchable metadata lives in these tables.

begin;

create unique index if not exists ess_site_projects_id_builder_unique_idx
  on public.ess_site_projects (id, builder_id);

-- Material requests already use this table when migration 020 is installed.
-- Repeat the additive definition here so this cutover remains a single runnable
-- migration on environments that were still relying on the JSON fallback.
create table if not exists public.ess_material_order_requests (
  id text primary key,
  source_order_id text,
  connected_parent_start_minutes integer,
  connected_parent_segment text check (
    connected_parent_segment is null
    or connected_parent_segment in ('primary', 'return')
  ),
  route_type text,
  builder_id text,
  builder_name text not null default '',
  project_id text,
  project_name text not null default '',
  requested_by_user_id text,
  requested_by_name text not null default '',
  order_date date,
  submitted_at timestamptz not null default timezone('utc', now()),
  notes text not null default '',
  item_values jsonb not null default '{}'::jsonb,
  pdf_path text not null default '',
  scaffolding_system text not null default '',
  details text not null default '',
  scheduled_date date,
  scheduled_hour integer check (
    scheduled_hour is null
    or (scheduled_hour >= 0 and scheduled_hour <= 23)
  ),
  scheduled_minute integer check (
    scheduled_minute is null
    or (scheduled_minute >= 0 and scheduled_minute <= 59)
  ),
  scheduled_at_iso text,
  scheduled_truck_id text,
  scheduled_truck_label text,
  truck_id text,
  truck_label text,
  delivery_status text,
  delivery_started_at timestamptz,
  delivery_unloading_at timestamptz,
  delivery_confirmed_at timestamptz,
  archived_at timestamptz,
  schedule_removed_at timestamptz,
  secondary_route jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_material_order_requests_submitted_at_idx
  on public.ess_material_order_requests (submitted_at desc);

create index if not exists ess_material_order_requests_scheduled_date_idx
  on public.ess_material_order_requests (scheduled_date);

create index if not exists ess_material_order_requests_archived_at_idx
  on public.ess_material_order_requests (archived_at);

create index if not exists ess_material_order_requests_source_order_id_idx
  on public.ess_material_order_requests (source_order_id);

create index if not exists ess_material_order_requests_route_type_idx
  on public.ess_material_order_requests (route_type);

create or replace function public.touch_ess_material_order_requests_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_material_order_requests_updated_at
  on public.ess_material_order_requests;
create trigger trg_touch_ess_material_order_requests_updated_at
before update on public.ess_material_order_requests
for each row
execute function public.touch_ess_material_order_requests_updated_at();

create table if not exists public.ess_safety_forms (
  form_type text not null check (
    form_type in (
      'scaff-tags',
      'handover-certificates',
      'day-labour-variations'
    )
  ),
  id text not null check (length(btrim(id)) > 0),
  builder_id text not null,
  project_id text not null,
  title text not null default '',
  reference_number text not null default '',
  requested_by text not null default '',
  project_label text not null default '',
  event_date text not null default '',
  pdf_path text not null default '',
  share_path text not null default '',
  photo_paths text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_by_user_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (form_type, id),
  foreign key (project_id, builder_id)
    references public.ess_site_projects (id, builder_id)
    on delete cascade
);

create index if not exists ess_safety_forms_project_kind_updated_idx
  on public.ess_safety_forms (
    builder_id,
    project_id,
    form_type,
    updated_at desc
  );

create index if not exists ess_safety_forms_reference_idx
  on public.ess_safety_forms (lower(reference_number));

create index if not exists ess_safety_forms_payload_gin_idx
  on public.ess_safety_forms using gin (payload);

create table if not exists public.ess_safety_files (
  storage_path text primary key check (length(btrim(storage_path)) > 0),
  builder_id text not null,
  project_id text not null,
  module_kind text not null check (length(btrim(module_kind)) > 0),
  file_name text not null check (length(btrim(file_name)) > 0),
  content_type text not null default 'application/pdf',
  file_size bigint check (file_size is null or file_size >= 0),
  uploaded_by_user_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (project_id, builder_id)
    references public.ess_site_projects (id, builder_id)
    on delete cascade
);

create index if not exists ess_safety_files_project_kind_updated_idx
  on public.ess_safety_files (
    builder_id,
    project_id,
    module_kind,
    updated_at desc
  );

create or replace function public.touch_ess_safety_record_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_safety_forms_updated_at
  on public.ess_safety_forms;
create trigger trg_touch_ess_safety_forms_updated_at
before update on public.ess_safety_forms
for each row
execute function public.touch_ess_safety_record_updated_at();

drop trigger if exists trg_touch_ess_safety_files_updated_at
  on public.ess_safety_files;
create trigger trg_touch_ess_safety_files_updated_at
before update on public.ess_safety_files
for each row
execute function public.touch_ess_safety_record_updated_at();

alter table public.ess_safety_forms enable row level security;
alter table public.ess_safety_files enable row level security;
alter table public.ess_material_order_requests enable row level security;

revoke all on table public.ess_safety_forms from public, anon;
revoke all on table public.ess_safety_files from public, anon;
grant select, insert, update, delete
  on table public.ess_safety_forms to authenticated;
grant select, insert, update, delete
  on table public.ess_safety_files to authenticated;
grant all on table public.ess_safety_forms to service_role;
grant all on table public.ess_safety_files to service_role;

drop policy if exists "safety_forms_authenticated_select"
  on public.ess_safety_forms;
create policy "safety_forms_authenticated_select"
on public.ess_safety_forms
for select
to authenticated
using (true);

drop policy if exists "safety_forms_authenticated_insert"
  on public.ess_safety_forms;
create policy "safety_forms_authenticated_insert"
on public.ess_safety_forms
for insert
to authenticated
with check (true);

drop policy if exists "safety_forms_authenticated_update"
  on public.ess_safety_forms;
create policy "safety_forms_authenticated_update"
on public.ess_safety_forms
for update
to authenticated
using (true)
with check (true);

drop policy if exists "safety_forms_authenticated_delete"
  on public.ess_safety_forms;
create policy "safety_forms_authenticated_delete"
on public.ess_safety_forms
for delete
to authenticated
using (true);

drop policy if exists "safety_files_authenticated_select"
  on public.ess_safety_files;
create policy "safety_files_authenticated_select"
on public.ess_safety_files
for select
to authenticated
using (true);

drop policy if exists "safety_files_authenticated_insert"
  on public.ess_safety_files;
create policy "safety_files_authenticated_insert"
on public.ess_safety_files
for insert
to authenticated
with check (true);

drop policy if exists "safety_files_authenticated_update"
  on public.ess_safety_files;
create policy "safety_files_authenticated_update"
on public.ess_safety_files
for update
to authenticated
using (true)
with check (true);

drop policy if exists "safety_files_authenticated_delete"
  on public.ess_safety_files;
create policy "safety_files_authenticated_delete"
on public.ess_safety_files
for delete
to authenticated
using (true);

-- Material order requests are already relational. Remove the legacy anonymous
-- access used by the JSON compatibility path and keep authenticated access only.
drop policy if exists "material_order_requests_select_anon_auth"
  on public.ess_material_order_requests;
drop policy if exists "material_order_requests_insert_anon_auth"
  on public.ess_material_order_requests;
drop policy if exists "material_order_requests_update_anon_auth"
  on public.ess_material_order_requests;
drop policy if exists "material_order_requests_delete_anon_auth"
  on public.ess_material_order_requests;
drop policy if exists "material_order_requests_select_authenticated"
  on public.ess_material_order_requests;
drop policy if exists "material_order_requests_insert_authenticated"
  on public.ess_material_order_requests;
drop policy if exists "material_order_requests_update_authenticated"
  on public.ess_material_order_requests;
drop policy if exists "material_order_requests_delete_authenticated"
  on public.ess_material_order_requests;

drop policy if exists "material_order_requests_authenticated_select"
  on public.ess_material_order_requests;
create policy "material_order_requests_authenticated_select"
on public.ess_material_order_requests
for select
to authenticated
using (true);

drop policy if exists "material_order_requests_authenticated_insert"
  on public.ess_material_order_requests;
create policy "material_order_requests_authenticated_insert"
on public.ess_material_order_requests
for insert
to authenticated
with check (true);

drop policy if exists "material_order_requests_authenticated_update"
  on public.ess_material_order_requests;
create policy "material_order_requests_authenticated_update"
on public.ess_material_order_requests
for update
to authenticated
using (true)
with check (true);

drop policy if exists "material_order_requests_authenticated_delete"
  on public.ess_material_order_requests;
create policy "material_order_requests_authenticated_delete"
on public.ess_material_order_requests
for delete
to authenticated
using (true);

revoke all on table public.ess_material_order_requests from anon;
grant select, insert, update, delete
  on table public.ess_material_order_requests to authenticated;
grant all on table public.ess_material_order_requests to service_role;

notify pgrst, 'reload schema';

commit;
