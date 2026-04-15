-- Migration: expand supported user roles
-- Date: 2026-04-15
-- Description: Allows employee portal roles to be persisted in user_roles.

begin;

alter table public.user_roles
    drop constraint if exists user_roles_role_check;

alter table public.user_roles
    add constraint user_roles_role_check
    check (role in ('admin', 'viewer', 'general_scaffolder', 'leading_hand'));

commit;
