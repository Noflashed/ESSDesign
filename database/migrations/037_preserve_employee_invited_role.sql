begin;

alter table public.ess_rostering_employees
    add column if not exists invited_role text;

update public.ess_rostering_employees
set invited_role = case
    when leading_hand then 'leading_hand'
    else 'general_scaffolder'
end
where invited_role is null;

alter table public.ess_rostering_employees
    alter column invited_role set default 'general_scaffolder',
    alter column invited_role set not null;

alter table public.ess_rostering_employees
    drop constraint if exists ess_rostering_employees_invited_role_check;

alter table public.ess_rostering_employees
    add constraint ess_rostering_employees_invited_role_check
    check (invited_role in (
        'admin',
        'viewer',
        'scaffold_designer',
        'site_supervisor',
        'project_manager',
        'leading_hand',
        'general_scaffolder',
        'transport_management'
    ));

commit;
