-- Keep linked ESS Design project folders aligned with Site Registry project names.
--
-- The linked folder ID is the source of truth for the relationship. This trigger
-- handles future project renames and folder links in the same database transaction.
-- The backfill at the end repairs projects that were renamed before this trigger
-- was installed.

begin;

create or replace function public.sync_site_project_name_to_design_folder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_folder_id uuid;
  builder_folder_name text;
  desired_folder_name text := upper(btrim(new.name));
begin
  if nullif(btrim(new.design_folder_id), '') is null then
    return new;
  end if;

  begin
    project_folder_id := btrim(new.design_folder_id)::uuid;
  exception
    when invalid_text_representation then
      -- Legacy registry data can contain a non-UUID folder reference. Leave it
      -- untouched so the existing folder-link repair flow can resolve it.
      return new;
  end;

  -- A Site Registry project must point to a depth-two folder. This prevents a
  -- stale or incorrect link from renaming a builder or drawing folder.
  select builder_folder.name
  into builder_folder_name
  from public.folders project_folder
  join public.folders builder_folder
    on builder_folder.id = project_folder.parent_folder_id
  where project_folder.id = project_folder_id
    and builder_folder.parent_folder_id is null;

  if not found then
    return new;
  end if;

  update public.folders
  set name = desired_folder_name,
      updated_at = timezone('utc', now())
  where id = project_folder_id
    and name is distinct from desired_folder_name;

  new.design_folder_path := builder_folder_name || ' / ' || desired_folder_name;
  return new;
end;
$$;

drop trigger if exists trg_sync_site_project_name_to_design_folder
  on public.ess_site_projects;

create trigger trg_sync_site_project_name_to_design_folder
before insert or update of name, design_folder_id
on public.ess_site_projects
for each row
execute function public.sync_site_project_name_to_design_folder();

revoke all on function public.sync_site_project_name_to_design_folder()
  from public, anon, authenticated;

-- Re-run linked rows through the trigger to repair names and stored paths from
-- project renames that happened before this migration.
update public.ess_site_projects project
set name = project.name,
    updated_at = timezone('utc', now())
where nullif(btrim(project.design_folder_id), '') is not null;

update public.ess_site_registry_meta
set revision = revision + 1,
    updated_at = timezone('utc', now())
where singleton = true
  and exists (
    select 1
    from public.ess_site_projects
    where nullif(btrim(design_folder_id), '') is not null
  );

commit;
