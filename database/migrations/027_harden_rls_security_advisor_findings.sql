-- Migration: Harden RLS policies flagged by Supabase Security Advisor
-- Date: 2026-05-28
-- Description:
--   - Enables RLS on ess_news when the table exists.
--   - Replaces broad anon/auth write policies with authenticated role-scoped policies.
--   - Revokes direct API execution of SECURITY DEFINER helper functions.

begin;

create or replace function public.current_user_has_any_role(required_roles text[])
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = any(required_roles)
    );
$$;

create or replace function public.current_user_can_write_truck(p_truck_id text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and (
          (ur.role = 'admin')
          or (ur.role = 'transport_management')
          or (ur.role = 'truck_ess01' and p_truck_id = 'truck-1')
          or (ur.role = 'truck_ess02' and p_truck_id = 'truck-2')
          or (ur.role = 'truck_ess03' and p_truck_id = 'truck-3')
        )
    );
$$;

revoke all on function public.current_user_has_any_role(text[]) from public, anon;
revoke all on function public.current_user_can_write_truck(text) from public, anon;
grant execute on function public.current_user_has_any_role(text[]) to authenticated, service_role;
grant execute on function public.current_user_can_write_truck(text) to authenticated, service_role;

do $$
declare
  policy_record record;
  table_name text;
  harden_tables text[] := array[
    'folders',
    'design_documents',
    'ess_news',
    'ess_leading_hand_relationships',
    'ess_material_orders',
    'ess_material_ordering_voice_memory',
    'ess_material_order_requests',
    'ess_transport_route_estimates',
    'ess_truck_live_locations',
    'ess_truck_location_history',
    'ess_transport_reverse_geocodes'
  ];
begin
  foreach table_name in array harden_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);

      for policy_record in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = table_name
          and cmd in ('ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE')
      loop
        execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
      end loop;
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.folders') is not null then
    execute $policy$create policy "folders_select_authenticated" on public.folders for select to authenticated using (auth.uid() is not null)$policy$;
    execute $policy$create policy "folders_insert_design_managers" on public.folders for insert to authenticated with check (public.current_user_has_any_role(array['admin', 'scaffold_designer']))$policy$;
    execute $policy$create policy "folders_update_design_managers" on public.folders for update to authenticated using (public.current_user_has_any_role(array['admin', 'scaffold_designer'])) with check (public.current_user_has_any_role(array['admin', 'scaffold_designer']))$policy$;
    execute $policy$create policy "folders_delete_design_managers" on public.folders for delete to authenticated using (public.current_user_has_any_role(array['admin', 'scaffold_designer']))$policy$;
  end if;

  if to_regclass('public.design_documents') is not null then
    execute $policy$create policy "design_documents_select_authenticated" on public.design_documents for select to authenticated using (auth.uid() is not null)$policy$;
    execute $policy$create policy "design_documents_insert_design_managers" on public.design_documents for insert to authenticated with check (public.current_user_has_any_role(array['admin', 'scaffold_designer']))$policy$;
    execute $policy$create policy "design_documents_update_design_managers" on public.design_documents for update to authenticated using (public.current_user_has_any_role(array['admin', 'scaffold_designer'])) with check (public.current_user_has_any_role(array['admin', 'scaffold_designer']))$policy$;
    execute $policy$create policy "design_documents_delete_design_managers" on public.design_documents for delete to authenticated using (public.current_user_has_any_role(array['admin', 'scaffold_designer']))$policy$;
  end if;

  if to_regclass('public.ess_news') is not null then
    execute $policy$create policy "ess_news_select_authenticated" on public.ess_news for select to authenticated using (auth.uid() is not null)$policy$;
    execute $policy$create policy "ess_news_insert_admin" on public.ess_news for insert to authenticated with check (public.current_user_has_any_role(array['admin']))$policy$;
    execute $policy$create policy "ess_news_update_admin" on public.ess_news for update to authenticated using (public.current_user_has_any_role(array['admin'])) with check (public.current_user_has_any_role(array['admin']))$policy$;
    execute $policy$create policy "ess_news_delete_admin" on public.ess_news for delete to authenticated using (public.current_user_has_any_role(array['admin']))$policy$;
  end if;

  if to_regclass('public.ess_leading_hand_relationships') is not null then
    execute $policy$create policy "leading_hand_relationships_select_authenticated" on public.ess_leading_hand_relationships for select to authenticated using (auth.uid() is not null)$policy$;
    execute $policy$create policy "leading_hand_relationships_insert_roster_managers" on public.ess_leading_hand_relationships for insert to authenticated with check (public.current_user_has_any_role(array['admin', 'viewer']))$policy$;
    execute $policy$create policy "leading_hand_relationships_update_roster_managers" on public.ess_leading_hand_relationships for update to authenticated using (public.current_user_has_any_role(array['admin', 'viewer'])) with check (public.current_user_has_any_role(array['admin', 'viewer']))$policy$;
    execute $policy$create policy "leading_hand_relationships_delete_roster_managers" on public.ess_leading_hand_relationships for delete to authenticated using (public.current_user_has_any_role(array['admin', 'viewer']))$policy$;
  end if;

  if to_regclass('public.ess_material_orders') is not null then
    execute $policy$create policy "material_orders_select_authenticated" on public.ess_material_orders for select to authenticated using (auth.uid() is not null)$policy$;
    execute $policy$create policy "material_orders_insert_authenticated" on public.ess_material_orders for insert to authenticated with check (auth.uid() is not null)$policy$;
    execute $policy$create policy "material_orders_update_authenticated" on public.ess_material_orders for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)$policy$;
    execute $policy$create policy "material_orders_delete_authenticated" on public.ess_material_orders for delete to authenticated using (auth.uid() is not null)$policy$;
  end if;

  if to_regclass('public.ess_material_order_requests') is not null then
    execute $policy$create policy "material_order_requests_select_authenticated" on public.ess_material_order_requests for select to authenticated using (auth.uid() is not null)$policy$;
    execute $policy$create policy "material_order_requests_insert_authenticated" on public.ess_material_order_requests for insert to authenticated with check (auth.uid() is not null)$policy$;
    execute $policy$create policy "material_order_requests_update_authenticated" on public.ess_material_order_requests for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)$policy$;
    execute $policy$create policy "material_order_requests_delete_authenticated" on public.ess_material_order_requests for delete to authenticated using (auth.uid() is not null)$policy$;
  end if;

  if to_regclass('public.ess_material_ordering_voice_memory') is not null then
    execute $policy$create policy "material_ordering_voice_memory_select_own" on public.ess_material_ordering_voice_memory for select to authenticated using (user_id = auth.uid())$policy$;
    execute $policy$create policy "material_ordering_voice_memory_insert_own" on public.ess_material_ordering_voice_memory for insert to authenticated with check (user_id = auth.uid())$policy$;
    execute $policy$create policy "material_ordering_voice_memory_update_own" on public.ess_material_ordering_voice_memory for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())$policy$;
  end if;

  if to_regclass('public.ess_transport_route_estimates') is not null then
    execute $policy$create policy "transport_route_estimates_select_authenticated" on public.ess_transport_route_estimates for select to authenticated using (auth.uid() is not null)$policy$;
  end if;

  if to_regclass('public.ess_transport_reverse_geocodes') is not null then
    execute $policy$create policy "transport_reverse_geocodes_select_authenticated" on public.ess_transport_reverse_geocodes for select to authenticated using (auth.uid() is not null)$policy$;
  end if;

  if to_regclass('public.ess_truck_live_locations') is not null then
    execute $policy$create policy "truck_live_locations_select_authenticated" on public.ess_truck_live_locations for select to authenticated using (auth.uid() is not null)$policy$;
    execute $policy$create policy "truck_live_locations_insert_truck_role" on public.ess_truck_live_locations for insert to authenticated with check (public.current_user_can_write_truck(truck_id))$policy$;
    execute $policy$create policy "truck_live_locations_update_truck_role" on public.ess_truck_live_locations for update to authenticated using (public.current_user_can_write_truck(truck_id)) with check (public.current_user_can_write_truck(truck_id))$policy$;
  end if;

  if to_regclass('public.ess_truck_location_history') is not null then
    execute $policy$create policy "truck_location_history_select_authenticated" on public.ess_truck_location_history for select to authenticated using (auth.uid() is not null)$policy$;
    execute $policy$create policy "truck_location_history_insert_truck_role" on public.ess_truck_location_history for insert to authenticated with check (public.current_user_can_write_truck(truck_id))$policy$;
    execute $policy$create policy "truck_location_history_update_truck_role" on public.ess_truck_location_history for update to authenticated using (public.current_user_can_write_truck(truck_id)) with check (public.current_user_can_write_truck(truck_id))$policy$;
  end if;

end $$;

revoke all on function public.handle_auth_user_change() from public, anon, authenticated;
revoke all on function public.handle_auth_user_role() from public, anon, authenticated;
revoke all on function public.refresh_timezone_cache() from public, anon, authenticated;
revoke all on function public.adjust_folder_total_file_size(uuid, bigint) from public, anon, authenticated;
revoke all on function public.get_folder_breadcrumbs(uuid) from public, anon, authenticated;
revoke all on function public.get_folder_hierarchy(uuid) from public, anon, authenticated;
revoke all on function public.search_folders(text, integer) from public, anon, authenticated;

grant execute on function public.handle_auth_user_change() to service_role;
grant execute on function public.handle_auth_user_role() to service_role;
grant execute on function public.refresh_timezone_cache() to postgres, service_role;
grant execute on function public.adjust_folder_total_file_size(uuid, bigint) to postgres, service_role;
grant execute on function public.get_folder_breadcrumbs(uuid) to service_role;
grant execute on function public.get_folder_hierarchy(uuid) to service_role;
grant execute on function public.search_folders(text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
