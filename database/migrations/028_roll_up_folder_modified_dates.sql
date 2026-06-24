-- Migration: Roll up ESS Design folder modified dates
-- Date: 2026-06-24
-- Description: Keeps folder updated_at aligned with child folder/document activity,
--   similar to a desktop file system's Date Modified column.

create or replace function public.touch_folder_modified_at(start_folder_id uuid, modified_at timestamptz default timezone('utc', now()))
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_id uuid := start_folder_id;
  effective_modified_at timestamptz := coalesce(modified_at, timezone('utc', now()));
begin
  while current_id is not null loop
    update public.folders
    set updated_at = effective_modified_at
    where id = current_id
      and (updated_at is null or updated_at < effective_modified_at);

    select parent_folder_id
    into current_id
    from public.folders
    where id = current_id;
  end loop;
end;
$$;

create or replace function public.sync_folder_modified_at_from_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.touch_folder_modified_at(new.folder_id, coalesce(new.updated_at, timezone('utc', now())));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.touch_folder_modified_at(old.folder_id, timezone('utc', now()));
    return old;
  end if;

  if new.folder_id is distinct from old.folder_id then
    perform public.touch_folder_modified_at(old.folder_id, timezone('utc', now()));
    perform public.touch_folder_modified_at(new.folder_id, coalesce(new.updated_at, timezone('utc', now())));
  else
    perform public.touch_folder_modified_at(new.folder_id, coalesce(new.updated_at, timezone('utc', now())));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_folder_modified_at_from_documents on public.design_documents;
create trigger trg_sync_folder_modified_at_from_documents
after insert or update or delete on public.design_documents
for each row
execute function public.sync_folder_modified_at_from_documents();

create or replace function public.sync_folder_modified_at_from_folders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.touch_folder_modified_at(new.parent_folder_id, coalesce(new.updated_at, timezone('utc', now())));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.touch_folder_modified_at(old.parent_folder_id, timezone('utc', now()));
    return old;
  end if;

  if new.parent_folder_id is distinct from old.parent_folder_id then
    perform public.touch_folder_modified_at(old.parent_folder_id, timezone('utc', now()));
    perform public.touch_folder_modified_at(new.parent_folder_id, coalesce(new.updated_at, timezone('utc', now())));
  elsif new.updated_at is distinct from old.updated_at then
    perform public.touch_folder_modified_at(new.parent_folder_id, new.updated_at);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_folder_modified_at_from_folders on public.folders;
create trigger trg_sync_folder_modified_at_from_folders
after insert or update of parent_folder_id, updated_at or delete on public.folders
for each row
execute function public.sync_folder_modified_at_from_folders();

with recursive folder_tree as (
  select id as ancestor_id, id as folder_id
  from public.folders

  union all

  select ft.ancestor_id, child.id as folder_id
  from folder_tree ft
  join public.folders child on child.parent_folder_id = ft.folder_id
),
folder_activity as (
  select
    ft.ancestor_id as folder_id,
    greatest(
      coalesce(max(child.updated_at), '-infinity'::timestamptz),
      coalesce(max(child.created_at), '-infinity'::timestamptz),
      coalesce(max(doc.updated_at), '-infinity'::timestamptz),
      coalesce(max(doc.created_at), '-infinity'::timestamptz)
    ) as latest_activity_at
  from folder_tree ft
  join public.folders child on child.id = ft.folder_id
  left join public.design_documents doc on doc.folder_id = ft.folder_id
  group by ft.ancestor_id
)
update public.folders f
set updated_at = fa.latest_activity_at
from folder_activity fa
where fa.folder_id = f.id
  and fa.latest_activity_at <> '-infinity'::timestamptz
  and (f.updated_at is null or f.updated_at < fa.latest_activity_at);

grant execute on function public.touch_folder_modified_at(uuid, timestamptz) to postgres, service_role;
