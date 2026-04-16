begin;

create table if not exists public.ess_material_ordering_voice_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  heard_phrase_normalized text not null,
  row_id text not null,
  side text not null,
  label text not null,
  spec text,
  confirmed_count integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ess_material_ordering_voice_memory_side_check check (side in ('left', 'middle', 'right'))
);

create unique index if not exists ess_material_ordering_voice_memory_unique_idx
  on public.ess_material_ordering_voice_memory (user_id, heard_phrase_normalized, row_id, side);

create index if not exists ess_material_ordering_voice_memory_lookup_idx
  on public.ess_material_ordering_voice_memory (user_id, heard_phrase_normalized);

alter table public.ess_material_ordering_voice_memory enable row level security;

drop policy if exists "material_ordering_voice_memory_select_anon_auth" on public.ess_material_ordering_voice_memory;
create policy "material_ordering_voice_memory_select_anon_auth"
on public.ess_material_ordering_voice_memory
for select
to anon, authenticated
using (true);

drop policy if exists "material_ordering_voice_memory_insert_anon_auth" on public.ess_material_ordering_voice_memory;
create policy "material_ordering_voice_memory_insert_anon_auth"
on public.ess_material_ordering_voice_memory
for insert
to anon, authenticated
with check (true);

drop policy if exists "material_ordering_voice_memory_update_anon_auth" on public.ess_material_ordering_voice_memory;
create policy "material_ordering_voice_memory_update_anon_auth"
on public.ess_material_ordering_voice_memory
for update
to anon, authenticated
using (true)
with check (true);

commit;
