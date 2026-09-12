-- Backend-only phrase metadata and shared generation accounting. Audio stays in the existing private bucket.
create table public.prestart_voice_phrases (
  id text primary key check (id ~ '^[A-F0-9]{64}$'),
  text text not null check (char_length(text) between 1 and 240),
  field text not null check (char_length(field) between 1 and 80),
  created_at timestamptz not null default now()
);
create index prestart_voice_phrases_field_created on public.prestart_voice_phrases(field, created_at desc);
create table public.prestart_voice_daily (
  day date not null,
  provider text not null check (provider in ('elevenlabs', 'deepgram')),
  reserved_characters bigint not null default 0,
  generations bigint not null default 0,
  cache_hits bigint not null default 0,
  budget_blocks bigint not null default 0,
  primary key(day, provider)
);
create table public.prestart_voice_attempts (
  attempt uuid primary key,
  audio_id text not null check (audio_id ~ '^[A-F0-9]{64}$'),
  day date not null,
  provider text not null,
  characters integer not null check (characters between 1 and 600),
  generated boolean not null default false,
  stored boolean not null default false,
  finished boolean not null default false,
  created_at timestamptz not null default now(),
  unique(audio_id, day)
);
alter table public.prestart_voice_phrases enable row level security;
alter table public.prestart_voice_daily enable row level security;
alter table public.prestart_voice_attempts enable row level security;
revoke all on public.prestart_voice_phrases, public.prestart_voice_daily, public.prestart_voice_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.prestart_voice_phrases, public.prestart_voice_daily, public.prestart_voice_attempts to service_role;

create function public.prestart_approve_phrase(p_id text, p_text text, p_field text) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('prestart_phrases', 0));
  if exists(select 1 from public.prestart_voice_phrases where id=p_id) then return true; end if;
  if (select count(*) from public.prestart_voice_phrases where field=p_field) >= 500 then return false; end if;
  insert into public.prestart_voice_phrases(id,text,field) values(p_id,p_text,p_field);
  return true;
end; $$;

create function public.prestart_reserve_voice(p_id text, p_attempt uuid, p_provider text, p_characters integer, p_limit integer) returns text
language plpgsql security invoker set search_path = '' as $$
declare d date := (now() at time zone 'UTC')::date; previous public.prestart_voice_attempts; used bigint;
begin
  if p_provider not in ('elevenlabs','deepgram') or p_characters not between 1 and 600 or p_limit < 0 or p_id !~ '^[A-F0-9]{64}$' then raise exception 'Invalid reservation'; end if;
  -- Global per-provider allowance is atomic across replicas. No reset on restart; failed/uncertain calls consume the reservation.
  perform pg_advisory_xact_lock(hashtextextended('prestart_voice:' || p_provider || ':' || d::text,0));
  select * into previous from public.prestart_voice_attempts where audio_id=p_id and day=d;
  if found then return case when previous.generated then 'generated' else 'busy' end; end if;
  insert into public.prestart_voice_daily(day,provider) values(d,p_provider) on conflict do nothing;
  select reserved_characters into used from public.prestart_voice_daily where day=d and provider=p_provider;
  if used + p_characters > p_limit then
    update public.prestart_voice_daily set budget_blocks=budget_blocks+1 where day=d and provider=p_provider;
    return 'budget';
  end if;
  insert into public.prestart_voice_attempts(attempt,audio_id,day,provider,characters) values(p_attempt,p_id,d,p_provider,p_characters);
  update public.prestart_voice_daily set reserved_characters=reserved_characters+p_characters, generations=generations+1 where day=d and provider=p_provider;
  return 'acquired';
end; $$;

create function public.prestart_finish_voice(p_attempt uuid, p_generated boolean, p_stored boolean) returns void
language sql security invoker set search_path = '' as $$
  update public.prestart_voice_attempts set generated=generated or p_generated, stored=stored or p_stored, finished=true where attempt=p_attempt;
$$;

create function public.prestart_voice_metric(p_provider text,p_metric text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_provider not in ('elevenlabs','deepgram') or p_metric <> 'cache_hits' then return; end if;
  insert into public.prestart_voice_daily(day,provider,cache_hits) values((now() at time zone 'UTC')::date,p_provider,1)
  on conflict(day,provider) do update set cache_hits=public.prestart_voice_daily.cache_hits+1;
end; $$;

revoke all on function public.prestart_approve_phrase(text,text,text), public.prestart_reserve_voice(text,uuid,text,integer,integer), public.prestart_finish_voice(uuid,boolean,boolean), public.prestart_voice_metric(text,text) from public,anon,authenticated;
grant execute on function public.prestart_approve_phrase(text,text,text), public.prestart_reserve_voice(text,uuid,text,integer,integer), public.prestart_finish_voice(uuid,boolean,boolean), public.prestart_voice_metric(text,text) to service_role;
