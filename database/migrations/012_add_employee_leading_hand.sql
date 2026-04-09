begin;

alter table if exists public.ess_rostering_employees
  add column if not exists leading_hand boolean not null default false;

commit;
