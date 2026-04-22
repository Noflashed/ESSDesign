-- Migration: add site_supervisor, project_manager, transport_management roles
-- Date: 2026-04-22

begin;

alter table public.user_roles
    drop constraint if exists user_roles_role_check;

alter table public.user_roles
    add constraint user_roles_role_check
    check (role in (
        'admin',
        'viewer',
        'site_supervisor',
        'project_manager',
        'leading_hand',
        'general_scaffolder',
        'transport_management'
    ));

commit;
