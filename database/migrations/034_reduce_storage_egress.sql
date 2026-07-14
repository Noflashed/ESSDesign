-- Reduce ESS Assistant storage egress and prevent duplicate indexing work.
-- Run this in the Supabase SQL Editor after migration 033.

alter table public.design_documents
    add column if not exists ess_design_file_fingerprint text,
    add column if not exists third_party_design_file_fingerprint text;

update public.design_documents
set ess_design_file_fingerprint = concat(
    'legacy:',
    ess_design_issue_path,
    ':',
    coalesce(ess_design_file_size::text, 'unknown'))
where ess_design_issue_path is not null
  and ess_design_file_fingerprint is null;

update public.design_documents
set third_party_design_file_fingerprint = concat(
    'legacy:',
    third_party_design_path,
    ':',
    coalesce(third_party_design_file_size::text, 'unknown'))
where third_party_design_path is not null
  and third_party_design_file_fingerprint is null;

update public.ess_ai_document_index as index_row
set fingerprint = documents.ess_design_file_fingerprint,
    source_updated_at = documents.updated_at,
    updated_at = now()
from public.design_documents as documents
where index_row.storage_bucket = 'design-pdfs'
  and index_row.storage_path = documents.ess_design_issue_path
  and documents.ess_design_file_fingerprint is not null
  and index_row.fingerprint is distinct from documents.ess_design_file_fingerprint;

update public.ess_ai_document_index as index_row
set fingerprint = documents.third_party_design_file_fingerprint,
    source_updated_at = documents.updated_at,
    updated_at = now()
from public.design_documents as documents
where index_row.storage_bucket = 'design-pdfs'
  and index_row.storage_path = documents.third_party_design_path
  and documents.third_party_design_file_fingerprint is not null
  and index_row.fingerprint is distinct from documents.third_party_design_file_fingerprint;

alter table public.ess_ai_document_index
    add column if not exists attempt_count integer not null default 0,
    add column if not exists next_retry_at timestamptz,
    add column if not exists last_download_bytes bigint not null default 0;

create index if not exists ess_ai_document_index_retry_idx
    on public.ess_ai_document_index (status, next_retry_at)
    where status in ('failed', 'pending');

create table if not exists public.ess_ai_worker_leases (
    lease_name text primary key,
    owner_id uuid not null,
    lease_expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

alter table public.ess_ai_worker_leases enable row level security;
revoke all on table public.ess_ai_worker_leases from anon, authenticated;
grant all on table public.ess_ai_worker_leases to service_role;

create or replace function public.try_acquire_ess_ai_worker_lease(
    p_lease_name text,
    p_owner_id uuid,
    p_lease_seconds integer default 900)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    acquired boolean;
begin
    insert into public.ess_ai_worker_leases (
        lease_name,
        owner_id,
        lease_expires_at,
        updated_at)
    values (
        p_lease_name,
        p_owner_id,
        now() + make_interval(secs => least(greatest(p_lease_seconds, 60), 3600)),
        now())
    on conflict (lease_name) do update
    set owner_id = excluded.owner_id,
        lease_expires_at = excluded.lease_expires_at,
        updated_at = now()
    where public.ess_ai_worker_leases.lease_expires_at <= now()
       or public.ess_ai_worker_leases.owner_id = p_owner_id
    returning true into acquired;

    return coalesce(acquired, false);
end;
$$;

create or replace function public.renew_ess_ai_worker_lease(
    p_lease_name text,
    p_owner_id uuid,
    p_lease_seconds integer default 900)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    renewed boolean;
begin
    update public.ess_ai_worker_leases
    set lease_expires_at = now() + make_interval(secs => least(greatest(p_lease_seconds, 60), 3600)),
        updated_at = now()
    where lease_name = p_lease_name
      and owner_id = p_owner_id
      and lease_expires_at > now()
    returning true into renewed;

    return coalesce(renewed, false);
end;
$$;

create or replace function public.release_ess_ai_worker_lease(
    p_lease_name text,
    p_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    released boolean;
begin
    delete from public.ess_ai_worker_leases
    where lease_name = p_lease_name
      and owner_id = p_owner_id
    returning true into released;

    return coalesce(released, false);
end;
$$;

create or replace function public.list_ess_ai_storage_pdfs(
    p_bucket text,
    p_prefix text default '',
    p_limit integer default 20000)
returns table (
    object_path text,
    updated_at timestamptz,
    created_at timestamptz,
    metadata jsonb)
language sql
stable
security definer
set search_path = ''
as $$
    select
        objects.name as object_path,
        objects.updated_at,
        objects.created_at,
        objects.metadata
    from storage.objects as objects
    where objects.bucket_id = p_bucket
      and (coalesce(p_prefix, '') = '' or objects.name like trim(both '/' from p_prefix) || '/%')
      and lower(objects.name) like '%.pdf'
    order by objects.updated_at desc nulls last, objects.name
    limit least(greatest(p_limit, 1), 20000);
$$;

revoke all on function public.try_acquire_ess_ai_worker_lease(text, uuid, integer) from public;
revoke all on function public.renew_ess_ai_worker_lease(text, uuid, integer) from public;
revoke all on function public.release_ess_ai_worker_lease(text, uuid) from public;
revoke all on function public.list_ess_ai_storage_pdfs(text, text, integer) from public;

grant execute on function public.try_acquire_ess_ai_worker_lease(text, uuid, integer) to service_role;
grant execute on function public.renew_ess_ai_worker_lease(text, uuid, integer) to service_role;
grant execute on function public.release_ess_ai_worker_lease(text, uuid) to service_role;
grant execute on function public.list_ess_ai_storage_pdfs(text, text, integer) to service_role;
