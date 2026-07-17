-- Employee-managed licences and credentials, including a required front image.
create table if not exists public.employee_credentials (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    credential_type text not null check (
        credential_type in ('white_card', 'driver_licence', 'high_risk_work_licence')
    ),
    credential_number text not null,
    licence_classes text,
    issuing_state text not null default 'NSW',
    issue_date date,
    expiry_date date,
    front_image_path text not null,
    front_image_content_type text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, credential_type)
);

create index if not exists employee_credentials_user_id_idx
    on public.employee_credentials (user_id);

alter table public.employee_credentials enable row level security;

drop policy if exists "Users can read own employee credentials" on public.employee_credentials;
create policy "Users can read own employee credentials"
    on public.employee_credentials for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can create own employee credentials" on public.employee_credentials;
create policy "Users can create own employee credentials"
    on public.employee_credentials for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "Users can update own employee credentials" on public.employee_credentials;
create policy "Users can update own employee credentials"
    on public.employee_credentials for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete own employee credentials" on public.employee_credentials;
create policy "Users can delete own employee credentials"
    on public.employee_credentials for delete to authenticated
    using (auth.uid() = user_id);

grant select, insert, update, delete on table public.employee_credentials to authenticated;
grant all on table public.employee_credentials to service_role;

-- Licence photographs contain sensitive identity information and must remain private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'employee-credentials',
    'employee-credentials',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own credential images" on storage.objects;
create policy "Users can read own credential images"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'employee-credentials'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can create own credential images" on storage.objects;
create policy "Users can create own credential images"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'employee-credentials'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can update own credential images" on storage.objects;
create policy "Users can update own credential images"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'employee-credentials'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'employee-credentials'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can delete own credential images" on storage.objects;
create policy "Users can delete own credential images"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'employee-credentials'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
