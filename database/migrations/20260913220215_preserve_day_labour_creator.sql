-- Keep the account that first created a Day Labour document, including saves
-- from older clients that send the editing user's ID on every upsert.
create or replace function public.preserve_day_labour_creator()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    new.created_by_user_id := old.created_by_user_id;
  else
    new.created_by_user_id := coalesce(auth.uid()::text, new.created_by_user_id);
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_day_labour_creator() from public, anon, authenticated;

drop trigger if exists trg_preserve_day_labour_creator on public.ess_safety_forms;
create trigger trg_preserve_day_labour_creator
before insert or update on public.ess_safety_forms
for each row
when (new.form_type = 'day-labour-variations')
execute function public.preserve_day_labour_creator();
