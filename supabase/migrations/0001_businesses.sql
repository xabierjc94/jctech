create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  tone text not null default 'profesional y cálido'
    check (tone in ('profesional y cálido', 'formal', 'cercano y casual', 'directo')),
  base_prompt text not null default '',
  address text,
  description text,
  google_calendar_connected boolean not null default false,
  google_refresh_token text,
  whatsapp_connected boolean not null default false,
  whatsapp_phone_number_id text,
  whatsapp_access_token text,
  created_at timestamptz not null default now()
);

create type business_role as enum ('owner', 'empleado');

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role business_role not null default 'empleado',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

alter table businesses enable row level security;
alter table business_members enable row level security;

create or replace function is_business_member(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;

create policy "members can read their business"
  on businesses for select
  using (is_business_member(id));

create policy "members can update their business"
  on businesses for update
  using (is_business_member(id));

create policy "members can read membership rows of their businesses"
  on business_members for select
  using (is_business_member(business_id));

create policy "owners can add members"
  on business_members for insert
  with check (
    exists (
      select 1 from business_members bm
      where bm.business_id = business_members.business_id
        and bm.user_id = auth.uid()
        and bm.role = 'owner'
    )
  );

create or replace function create_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  insert into businesses (name) values (p_name) returning id into v_business_id;
  insert into business_members (business_id, user_id, role)
    values (v_business_id, auth.uid(), 'owner');
  return v_business_id;
end;
$$;

grant select, update on businesses to authenticated;
grant select, insert on business_members to authenticated;

grant select, insert, update, delete on businesses to service_role;
grant select, insert, update, delete on business_members to service_role;
