-- ESS Assistant: shared conversations, auditability, feedback, and document indexing.
-- The server uses the service role for writes; RLS keeps browser access scoped to the signed-in user.

create table if not exists public.ess_ai_conversations (
    id uuid primary key,
    user_id uuid not null,
    title text not null default 'New conversation',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists ess_ai_conversations_user_updated_idx
    on public.ess_ai_conversations (user_id, updated_at desc);

create table if not exists public.ess_ai_messages (
    id uuid primary key,
    conversation_id uuid not null references public.ess_ai_conversations(id) on delete cascade,
    user_id uuid not null,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    sources jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists ess_ai_messages_conversation_created_idx
    on public.ess_ai_messages (conversation_id, created_at desc);

create table if not exists public.ess_ai_runs (
    id uuid primary key,
    conversation_id uuid not null references public.ess_ai_conversations(id) on delete cascade,
    user_id uuid not null,
    user_role text,
    model text not null,
    tool_names jsonb not null default '[]'::jsonb,
    tool_call_count integer not null default 0,
    input_tokens integer not null default 0,
    output_tokens integer not null default 0,
    duration_ms bigint not null default 0,
    success boolean not null default false,
    error_code text,
    created_at timestamptz not null default now()
);

create index if not exists ess_ai_runs_created_idx on public.ess_ai_runs (created_at desc);
create index if not exists ess_ai_runs_user_created_idx on public.ess_ai_runs (user_id, created_at desc);

create table if not exists public.ess_ai_feedback (
    id uuid primary key,
    conversation_id uuid not null references public.ess_ai_conversations(id) on delete cascade,
    message_id uuid references public.ess_ai_messages(id) on delete set null,
    user_id uuid not null,
    rating smallint not null check (rating in (-1, 1)),
    comment text,
    created_at timestamptz not null default now()
);

create index if not exists ess_ai_feedback_created_idx on public.ess_ai_feedback (created_at desc);

create table if not exists public.ess_ai_settings (
    key text primary key,
    value text,
    updated_at timestamptz not null default now()
);

create table if not exists public.ess_ai_document_index (
    id uuid primary key,
    domain text not null,
    record_id text not null,
    storage_bucket text not null,
    storage_path text not null,
    display_name text not null,
    source_updated_at timestamptz,
    fingerprint text not null,
    openai_file_id text,
    vector_store_id text,
    status text not null check (status in ('ready', 'failed', 'skipped', 'pending')),
    error text,
    last_synced_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (storage_bucket, storage_path)
);

create index if not exists ess_ai_document_index_status_idx
    on public.ess_ai_document_index (status, updated_at desc);

alter table public.ess_ai_conversations enable row level security;
alter table public.ess_ai_messages enable row level security;
alter table public.ess_ai_runs enable row level security;
alter table public.ess_ai_feedback enable row level security;
alter table public.ess_ai_settings enable row level security;
alter table public.ess_ai_document_index enable row level security;

drop policy if exists "Users can read own AI conversations" on public.ess_ai_conversations;
create policy "Users can read own AI conversations"
    on public.ess_ai_conversations for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can read own AI messages" on public.ess_ai_messages;
create policy "Users can read own AI messages"
    on public.ess_ai_messages for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can read own AI feedback" on public.ess_ai_feedback;
create policy "Users can read own AI feedback"
    on public.ess_ai_feedback for select to authenticated
    using (auth.uid() = user_id);

revoke all on table public.ess_ai_runs from anon, authenticated;
revoke all on table public.ess_ai_settings from anon, authenticated;
revoke all on table public.ess_ai_document_index from anon, authenticated;

grant all on table public.ess_ai_conversations to service_role;
grant all on table public.ess_ai_messages to service_role;
grant all on table public.ess_ai_runs to service_role;
grant all on table public.ess_ai_feedback to service_role;
grant all on table public.ess_ai_settings to service_role;
grant all on table public.ess_ai_document_index to service_role;

grant select on table public.ess_ai_conversations to authenticated;
grant select on table public.ess_ai_messages to authenticated;
grant select on table public.ess_ai_feedback to authenticated;
