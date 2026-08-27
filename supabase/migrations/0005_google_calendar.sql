-- El id del calendario donde se crean los eventos. "primary" es el principal
-- de la cuenta y sirve como valor por defecto.
alter table businesses
  add column google_calendar_id text not null default 'primary';

-- Correo de la cuenta conectada: se muestra en Integraciones para que el
-- negocio sepa qué cuenta está enlazada.
alter table businesses
  add column google_account_email text;

-- Momento de la última sincronización, para poder mostrarlo y para no
-- sincronizar en cada carga de página.
alter table businesses
  add column google_synced_at timestamptz;

-- Las citas creadas desde Google no tienen conversación ni servicio; conviene
-- distinguir su origen para no confundirlas con las que agendó el agente.
alter table appointments
  add column source text not null default 'agente'
  check (source in ('agente', 'google', 'panel'));

-- Un evento de Google se sincroniza una sola vez por negocio.
create unique index if not exists appointments_business_google_event_idx
  on appointments (business_id, google_event_id)
  where google_event_id is not null;
