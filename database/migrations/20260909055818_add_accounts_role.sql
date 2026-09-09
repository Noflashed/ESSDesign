begin;

-- Accounts is an individual role shared by the web, mobile, and backend suite.
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in (
    'admin', 'viewer', 'accounts', 'scaffold_designer', 'site_supervisor',
    'project_manager', 'leading_hand', 'general_scaffolder', 'transport_management',
    'truck_ess01', 'truck_ess02', 'truck_ess03'
));

alter table public.ess_rostering_employees
    drop constraint if exists ess_rostering_employees_invited_role_check;
alter table public.ess_rostering_employees
    add constraint ess_rostering_employees_invited_role_check check (invited_role in (
        'admin', 'viewer', 'accounts', 'scaffold_designer', 'site_supervisor',
        'project_manager', 'leading_hand', 'general_scaffolder', 'transport_management'
    ));

commit;
