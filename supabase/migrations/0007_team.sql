-- Email denormalizado: listar el equipo sin él obligaría a leer auth.users con
-- service_role en cada carga de página.
alter table business_members add column email text;

-- Relleno de las membresías que ya existen.
update business_members m
set email = u.email
from auth.users u
where u.id = m.user_id and m.email is null;

create table business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  role business_role not null default 'empleado',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

alter table business_invitations enable row level security;

create policy "members can manage invitations" on business_invitations for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id));

-- El invitado necesita ver su propia invitación aunque todavía no sea miembro.
create policy "invitee can see own invitation" on business_invitations for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

grant select, insert, update, delete on business_invitations to authenticated;
grant select, insert, update, delete on business_invitations to service_role;

-- create_business también guarda el email del dueño.
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

  insert into business_members (business_id, user_id, role, email)
    values (
      v_business_id,
      auth.uid(),
      'owner',
      (select email from auth.users where id = auth.uid())
    );

  return v_business_id;
end;
$$;

-- Convierte en membresías las invitaciones pendientes del usuario actual.
-- Es security definer porque insertar en business_members exige ser owner, y el
-- invitado todavía no lo es; la comprobación real es que la invitación exista
-- para su email.
create or replace function accept_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer := 0;
begin
  select email into v_email from auth.users where id = auth.uid();

  if v_email is null then
    return 0;
  end if;

  insert into business_members (business_id, user_id, role, email)
  select i.business_id, auth.uid(), i.role, v_email
  from business_invitations i
  where lower(i.email) = lower(v_email)
  on conflict (business_id, user_id) do nothing;

  get diagnostics v_count = row_count;

  delete from business_invitations
  where lower(email) = lower(v_email);

  return v_count;
end;
$$;
