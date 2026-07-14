-- Reduce ESS Assistant request latency without changing document indexing or storage behavior.
-- Run after migrations 033 and 034.

alter table public.ess_ai_runs
    add column if not exists route text,
    add column if not exists authentication_ms bigint not null default 0,
    add column if not exists preparation_ms bigint not null default 0,
    add column if not exists model_ms bigint not null default 0,
    add column if not exists tool_ms bigint not null default 0,
    add column if not exists persistence_ms bigint not null default 0,
    add column if not exists first_event_ms bigint not null default 0,
    add column if not exists cached_input_tokens integer not null default 0,
    add column if not exists reasoning_tokens integer not null default 0;

create or replace function public.prepare_ess_ai_chat_turn(
    p_conversation_id uuid,
    p_user_id uuid,
    p_title text,
    p_message_id uuid,
    p_message text,
    p_history_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_conversation_id uuid;
    v_history jsonb;
begin
    if p_conversation_id is not null then
        select conversations.id
        into v_conversation_id
        from public.ess_ai_conversations as conversations
        where conversations.id = p_conversation_id
          and conversations.user_id = p_user_id;
    end if;

    if v_conversation_id is null then
        v_conversation_id := gen_random_uuid();
        insert into public.ess_ai_conversations (id, user_id, title, created_at, updated_at)
        values (v_conversation_id, p_user_id, left(coalesce(nullif(trim(p_title), ''), 'New conversation'), 80), now(), now());
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object('role', history_rows.role, 'content', history_rows.content)
            order by history_rows.created_at),
        '[]'::jsonb)
    into v_history
    from (
        select messages.role, messages.content, messages.created_at
        from public.ess_ai_messages as messages
        where messages.conversation_id = v_conversation_id
          and messages.user_id = p_user_id
        order by messages.created_at desc
        limit least(greatest(p_history_limit, 1), 20)
    ) as history_rows;

    insert into public.ess_ai_messages (
        id, conversation_id, user_id, role, content, sources, created_at)
    values (
        p_message_id, v_conversation_id, p_user_id, 'user', left(p_message, 30000), '[]'::jsonb, now())
    on conflict (id) do nothing;

    update public.ess_ai_conversations
    set updated_at = now()
    where id = v_conversation_id
      and user_id = p_user_id;

    return jsonb_build_object(
        'conversationId', v_conversation_id,
        'history', v_history);
end;
$$;

revoke all on function public.prepare_ess_ai_chat_turn(uuid, uuid, text, uuid, text, integer) from public;
grant execute on function public.prepare_ess_ai_chat_turn(uuid, uuid, text, uuid, text, integer) to service_role;
