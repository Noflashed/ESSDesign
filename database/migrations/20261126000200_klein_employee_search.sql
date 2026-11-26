create function public.klein_employee_search(search_name text)
returns jsonb language sql stable security invoker set search_path = '' as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'firstName', e.first_name, 'lastName', e.last_name,
        'preferredName', p.preferred_name,
        'role', coalesce(nullif(r.role, 'viewer'), e.invited_role),
        'leadingHand', e.leading_hand, 'linkedUserId', e.linked_auth_user_id
    ) order by e.last_name, e.first_name, e.id), '[]'::jsonb)
    from public.ess_rostering_employees e
    left join public.user_names p on p.id = e.linked_auth_user_id
    left join public.user_roles r on r.user_id = e.linked_auth_user_id
    where strpos(lower(concat_ws(' ', e.first_name, e.last_name)), lower(trim(coalesce(search_name, '')))) > 0
       or strpos(lower(concat_ws(' ', p.preferred_name, e.last_name)), lower(trim(coalesce(search_name, '')))) > 0;
$$;
revoke all on function public.klein_employee_search(text) from public, anon, authenticated;
grant execute on function public.klein_employee_search(text) to service_role;
