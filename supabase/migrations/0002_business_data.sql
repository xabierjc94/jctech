create table business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null
);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  unique (business_id, slug)
);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  key text not null,
  content text not null,
  unique (business_id, key)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  contact_name text,
  contact_phone text not null,
  bot_active boolean not null default true,
  last_message_at timestamptz not null default now(),
  unique (business_id, contact_phone)
);

create type message_sender as enum ('cliente', 'agente_ia', 'humano');

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender message_sender not null,
  content text not null,
  created_at timestamptz not null default now()
);

create type appointment_status as enum ('confirmada', 'cancelada', 'completada');

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  google_event_id text,
  conversation_id uuid references conversations(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  contact_name text,
  contact_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'confirmada',
  created_at timestamptz not null default now()
);

alter table business_hours enable row level security;
alter table services enable row level security;
alter table message_templates enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table appointments enable row level security;

create policy "members can manage business_hours" on business_hours for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage services" on services for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage message_templates" on message_templates for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage conversations" on conversations for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage appointments" on appointments for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage messages" on messages for all
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and is_business_member(c.business_id)
    )
  )
  with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and is_business_member(c.business_id)
    )
  );

grant select, insert, update, delete on business_hours to authenticated;
grant select, insert, update, delete on services to authenticated;
grant select, insert, update, delete on message_templates to authenticated;
grant select, insert, update, delete on conversations to authenticated;
grant select, insert, update, delete on messages to authenticated;
grant select, insert, update, delete on appointments to authenticated;

grant select, insert, update, delete on business_hours to service_role;
grant select, insert, update, delete on services to service_role;
grant select, insert, update, delete on message_templates to service_role;
grant select, insert, update, delete on conversations to service_role;
grant select, insert, update, delete on messages to service_role;
grant select, insert, update, delete on appointments to service_role;

create index messages_conversation_id_created_at_idx
  on messages (conversation_id, created_at);
