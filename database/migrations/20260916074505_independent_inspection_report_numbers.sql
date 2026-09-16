-- Inspection reports have a global register independent of handover numbering.
lock table public.ess_safety_forms in share row exclusive mode;
create table public.ess_inspection_report_counter (
  singleton boolean primary key default true check (singleton),
  last_value bigint not null default 0 check (last_value >= 0)
);
alter table public.ess_inspection_report_counter enable row level security;
revoke all on public.ess_inspection_report_counter from public, anon, authenticated;

-- Replace inherited handover numbers on existing reports in creation/date order.
with numbered as (
  select id, row_number() over (order by created_at,
    to_date(payload->>'inspectionDateTime','DD/MM/YYYY'), id)::text as number
  from public.ess_safety_forms where form_type='inspection-reports'
)
update public.ess_safety_forms f
set reference_number=lpad(n.number,greatest(4,length(n.number)),'0'),
    payload=jsonb_set(jsonb_set(f.payload,'{inspectionNumber}',to_jsonb(lpad(n.number,greatest(4,length(n.number)),'0'))),'{pdfPath}','""'::jsonb),
    pdf_path=''
from numbered n where f.form_type='inspection-reports' and f.id=n.id;

insert into public.ess_inspection_report_counter(singleton,last_value)
select true,count(*) from public.ess_safety_forms where form_type='inspection-reports';

create or replace function public.assign_inspection_report_number() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare assigned text; next_number bigint;
begin
  if tg_op='UPDATE' then
    assigned := old.reference_number;
  else
    -- ON CONFLICT saves run INSERT triggers too: do not consume another number.
    select reference_number into assigned from public.ess_safety_forms
      where form_type='inspection-reports' and id=new.id;
    if assigned is null then
      update public.ess_inspection_report_counter set last_value=last_value+1
        where singleton returning last_value into next_number;
      assigned := lpad(next_number::text,greatest(4,length(next_number::text)),'0');
    end if;
  end if;
  new.reference_number := assigned;
  new.payload := jsonb_set(new.payload,'{inspectionNumber}',to_jsonb(assigned));
  return new;
end $$;
revoke all on function public.assign_inspection_report_number() from public, anon, authenticated;
create trigger trg_assign_inspection_report_number
before insert or update on public.ess_safety_forms
for each row when (new.form_type='inspection-reports')
execute function public.assign_inspection_report_number();
create unique index ess_inspection_report_number_unique on public.ess_safety_forms(reference_number)
where form_type='inspection-reports';
