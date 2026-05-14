begin;

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scaffold-ai-training',
  'scaffold-ai-training',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ess_scaffold_ai_training_images (
  id uuid primary key default gen_random_uuid(),
  component_class text not null check (component_class in ('ledger', 'transom', 'standard')),
  object_path text not null unique,
  file_name text not null default '',
  content_type text not null default 'image/jpeg',
  width integer,
  height integer,
  uploaded_by text,
  uploaded_by_name text,
  notes text,
  source text not null default 'ios-camera',
  label_status text not null default 'class-labelled',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_scaffold_ai_training_images_class_idx
  on public.ess_scaffold_ai_training_images (component_class);

create index if not exists ess_scaffold_ai_training_images_label_status_idx
  on public.ess_scaffold_ai_training_images (label_status);

create index if not exists ess_scaffold_ai_training_images_created_idx
  on public.ess_scaffold_ai_training_images (created_at desc);

create table if not exists public.ess_scaffold_ai_annotations (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.ess_scaffold_ai_training_images(id) on delete cascade,
  component_class text not null check (component_class in ('ledger', 'transom', 'standard')),
  x double precision not null check (x >= 0 and x <= 1),
  y double precision not null check (y >= 0 and y <= 1),
  width double precision not null check (width > 0 and width <= 1),
  height double precision not null check (height > 0 and height <= 1),
  created_by text,
  created_by_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ess_scaffold_ai_annotations_image_idx
  on public.ess_scaffold_ai_annotations (image_id);

create index if not exists ess_scaffold_ai_annotations_class_idx
  on public.ess_scaffold_ai_annotations (component_class);

create or replace function public.touch_ess_scaffold_ai_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_ess_scaffold_ai_training_images_updated_at on public.ess_scaffold_ai_training_images;
create trigger trg_touch_ess_scaffold_ai_training_images_updated_at
before update on public.ess_scaffold_ai_training_images
for each row
execute function public.touch_ess_scaffold_ai_updated_at();

drop trigger if exists trg_touch_ess_scaffold_ai_annotations_updated_at on public.ess_scaffold_ai_annotations;
create trigger trg_touch_ess_scaffold_ai_annotations_updated_at
before update on public.ess_scaffold_ai_annotations
for each row
execute function public.touch_ess_scaffold_ai_updated_at();

alter table public.ess_scaffold_ai_training_images enable row level security;
alter table public.ess_scaffold_ai_annotations enable row level security;

drop policy if exists "scaffold_ai_training_images_select_anon_auth" on public.ess_scaffold_ai_training_images;
create policy "scaffold_ai_training_images_select_anon_auth"
on public.ess_scaffold_ai_training_images
for select
to anon, authenticated
using (true);

drop policy if exists "scaffold_ai_training_images_insert_anon_auth" on public.ess_scaffold_ai_training_images;
create policy "scaffold_ai_training_images_insert_anon_auth"
on public.ess_scaffold_ai_training_images
for insert
to anon, authenticated
with check (component_class in ('ledger', 'transom', 'standard'));

drop policy if exists "scaffold_ai_training_images_update_anon_auth" on public.ess_scaffold_ai_training_images;
create policy "scaffold_ai_training_images_update_anon_auth"
on public.ess_scaffold_ai_training_images
for update
to anon, authenticated
using (true)
with check (component_class in ('ledger', 'transom', 'standard'));

drop policy if exists "scaffold_ai_annotations_select_anon_auth" on public.ess_scaffold_ai_annotations;
create policy "scaffold_ai_annotations_select_anon_auth"
on public.ess_scaffold_ai_annotations
for select
to anon, authenticated
using (true);

drop policy if exists "scaffold_ai_annotations_insert_anon_auth" on public.ess_scaffold_ai_annotations;
create policy "scaffold_ai_annotations_insert_anon_auth"
on public.ess_scaffold_ai_annotations
for insert
to anon, authenticated
with check (component_class in ('ledger', 'transom', 'standard'));

drop policy if exists "scaffold_ai_annotations_update_anon_auth" on public.ess_scaffold_ai_annotations;
create policy "scaffold_ai_annotations_update_anon_auth"
on public.ess_scaffold_ai_annotations
for update
to anon, authenticated
using (true)
with check (component_class in ('ledger', 'transom', 'standard'));

drop policy if exists "scaffold_ai_annotations_delete_anon_auth" on public.ess_scaffold_ai_annotations;
create policy "scaffold_ai_annotations_delete_anon_auth"
on public.ess_scaffold_ai_annotations
for delete
to anon, authenticated
using (true);

drop policy if exists "scaffold_ai_storage_select_anon_auth" on storage.objects;
create policy "scaffold_ai_storage_select_anon_auth"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'scaffold-ai-training');

drop policy if exists "scaffold_ai_storage_insert_anon_auth" on storage.objects;
create policy "scaffold_ai_storage_insert_anon_auth"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'scaffold-ai-training');

drop policy if exists "scaffold_ai_storage_update_anon_auth" on storage.objects;
create policy "scaffold_ai_storage_update_anon_auth"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'scaffold-ai-training')
with check (bucket_id = 'scaffold-ai-training');

notify pgrst, 'reload schema';

commit;
