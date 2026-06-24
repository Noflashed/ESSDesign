-- Migration: Fix ESS News RLS and storage policies
-- Date: 2026-06-24
-- Description: Allows admin users to create ESS News rows and upload media under Supabase RLS.

begin;

insert into storage.buckets (id, name, public)
values ('ess-news', 'ess-news', true)
on conflict (id) do update
set public = true;

do $$
begin
  if to_regclass('public.ess_news') is not null then
    alter table public.ess_news enable row level security;

    grant select on public.ess_news to anon, authenticated;
    grant insert, update, delete on public.ess_news to authenticated;

    drop policy if exists "ess_news_select_authenticated" on public.ess_news;
    drop policy if exists "ess_news_select_public" on public.ess_news;
    drop policy if exists "ess_news_insert_admin" on public.ess_news;
    drop policy if exists "ess_news_update_admin" on public.ess_news;
    drop policy if exists "ess_news_delete_admin" on public.ess_news;

    create policy "ess_news_select_public"
      on public.ess_news
      for select
      to anon, authenticated
      using (true);

    create policy "ess_news_insert_admin"
      on public.ess_news
      for insert
      to authenticated
      with check (public.current_user_has_any_role(array['admin']));

    create policy "ess_news_update_admin"
      on public.ess_news
      for update
      to authenticated
      using (public.current_user_has_any_role(array['admin']))
      with check (public.current_user_has_any_role(array['admin']));

    create policy "ess_news_delete_admin"
      on public.ess_news
      for delete
      to authenticated
      using (public.current_user_has_any_role(array['admin']));
  end if;
end $$;

drop policy if exists "ess_news_storage_select_public" on storage.objects;
drop policy if exists "ess_news_storage_insert_admin" on storage.objects;
drop policy if exists "ess_news_storage_update_admin" on storage.objects;
drop policy if exists "ess_news_storage_delete_admin" on storage.objects;

create policy "ess_news_storage_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'ess-news');

create policy "ess_news_storage_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ess-news'
    and public.current_user_has_any_role(array['admin'])
  );

create policy "ess_news_storage_update_admin"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'ess-news'
    and public.current_user_has_any_role(array['admin'])
  )
  with check (
    bucket_id = 'ess-news'
    and public.current_user_has_any_role(array['admin'])
  );

create policy "ess_news_storage_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ess-news'
    and public.current_user_has_any_role(array['admin'])
  );

notify pgrst, 'reload schema';

commit;
