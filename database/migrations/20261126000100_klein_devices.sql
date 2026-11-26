begin;
create schema if not exists klein_private;
revoke all on schema klein_private from public, anon, authenticated;
create table klein_private.devices (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id) on delete cascade,
 name text not null, platform text not null, key_hash text not null unique,
 scopes text[] not null, created_at timestamptz not null default now(), last_used timestamptz
);
create table klein_private.pairings (
 id uuid primary key default gen_random_uuid(), code text not null unique, challenge text not null,
 name text not null, platform text not null, expires timestamptz not null default now()+interval '10 minutes',
 owner uuid references auth.users(id) on delete cascade, scopes text[]
);
create index on klein_private.pairings(expires);
create index on klein_private.devices(owner);

-- Only the ESS server may invoke this function. All state transitions are transactional.
create function public.klein_device_request(op text, args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 p klein_private.pairings%rowtype;
 d klein_private.devices%rowtype;
 owner_id uuid := (args->>'owner')::uuid;
 result jsonb;
begin
 if op='start' then
   delete from klein_private.pairings where expires<=now();
   insert into klein_private.pairings(code,challenge,name,platform)
   values(args->>'code',args->>'challenge',args->>'name',args->>'platform') returning * into p;
   return to_jsonb(p.id);
 elsif op in ('details','approve','deny') then
   select * into p from klein_private.pairings where code=args->>'code' and expires>now() and owner is null for update;
   if not found then return null; end if;
   if op='approve' then
     update klein_private.pairings set owner=owner_id, scopes=array(select jsonb_array_elements_text(args->'scopes')) where id=p.id;
   elsif op='deny' then
     delete from klein_private.pairings where id=p.id;
   end if;
   return jsonb_build_object('name',p.name,'platform',p.platform);
 elsif op='token' then
   select * into p from klein_private.pairings where id=(args->>'id')::uuid and challenge=args->>'challenge' and expires>now() for update;
   if not found then return null; end if;
   if p.owner is null then return '{"status":"pending"}'; end if;
   insert into klein_private.devices(owner,name,platform,key_hash,scopes)
   values(p.owner,p.name,p.platform,args->>'hash',p.scopes) returning * into d;
   delete from klein_private.pairings where id=p.id;
 elsif op='authenticate' then
   update klein_private.devices set last_used=now() where key_hash=args->>'hash'
     and exists (select 1 from auth.users u where u.id=owner and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) returning * into d;
   if not found then return null; end if;
 elsif op='list' then
   select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]'::jsonb) into result from
     (select id,name,platform,scopes,created_at,last_used from klein_private.devices where owner=owner_id) v;
   return result;
 elsif op='revoke' then
   delete from klein_private.devices where owner=owner_id and id=(args->>'id')::uuid;
   return to_jsonb(found);
 else
   raise exception 'Unknown Klein operation';
 end if;
 return jsonb_build_object('id',d.id,'name',d.name,'owner',d.owner,'scopes',d.scopes);
end $$;
revoke all on function public.klein_device_request(text,jsonb) from public, anon, authenticated;
grant execute on function public.klein_device_request(text,jsonb) to service_role;
commit;
