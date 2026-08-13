begin;

create or replace function public.generate_scaff_tag_qr_short_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  candidate text;
begin
  loop
    candidate := replace(replace(rtrim(encode(gen_random_bytes(8), 'base64'), '='), '+', '-'), '/', '_');
    exit when not exists (
      select 1 from public.ess_scaff_tag_qr_labels where short_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

alter table public.ess_scaff_tag_qr_labels
  add column if not exists short_code text;

update public.ess_scaff_tag_qr_labels
set short_code = public.generate_scaff_tag_qr_short_code()
where short_code is null or btrim(short_code) = '';

alter table public.ess_scaff_tag_qr_labels
  alter column short_code set default public.generate_scaff_tag_qr_short_code(),
  alter column short_code set not null;

create unique index if not exists uq_ess_scaff_tag_qr_labels_short_code
  on public.ess_scaff_tag_qr_labels (short_code);

create or replace function public.assign_scaff_tag_qr_label_by_code(
  p_short_code text,
  p_builder_id text,
  p_project_id text,
  p_form_id text,
  p_retire_existing boolean default false
)
returns public.ess_scaff_tag_qr_labels
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_token uuid;
begin
  select public_token into selected_token
  from public.ess_scaff_tag_qr_labels
  where short_code = btrim(p_short_code);

  if not found then
    raise exception 'This QR label is not recognised.';
  end if;

  return public.assign_scaff_tag_qr_label(
    selected_token,
    p_builder_id,
    p_project_id,
    p_form_id,
    p_retire_existing
  );
end;
$$;

revoke all on function public.generate_scaff_tag_qr_short_code() from public, anon, authenticated;
revoke all on function public.assign_scaff_tag_qr_label_by_code(text, text, text, text, boolean) from public, anon;
grant execute on function public.assign_scaff_tag_qr_label_by_code(text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
