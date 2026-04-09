begin;

alter table if exists public.ess_rostering_employees
  add column if not exists email text,
  add column if not exists linked_auth_user_id uuid,
  add column if not exists invite_sent_at timestamptz,
  add column if not exists verified_at timestamptz;

create index if not exists ess_rostering_employees_email_idx
  on public.ess_rostering_employees (lower(email))
  where email is not null;

create index if not exists ess_rostering_employees_linked_auth_user_idx
  on public.ess_rostering_employees (linked_auth_user_id)
  where linked_auth_user_id is not null;

commit;
