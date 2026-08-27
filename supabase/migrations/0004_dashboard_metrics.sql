-- Las 4 tarjetas del dashboard hacían 4 consultas de conteo separadas, cada una
-- con su viaje de red y su evaluación de RLS por fila. Esta función las resuelve
-- en una sola llamada.
--
-- Es `security definer` porque hace su propia comprobación de pertenencia con
-- `is_business_member`: sin ella, un usuario podría pedir los recuentos de un
-- negocio ajeno.
create or replace function dashboard_metrics(
  p_business_id uuid,
  p_since timestamptz,
  p_week_from timestamptz,
  p_week_to timestamptz,
  p_today_from timestamptz,
  p_today_to timestamptz
)
returns table (
  conversations_30d bigint,
  appointments_this_week bigint,
  appointments_today bigint,
  paused_bots bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_business_member(p_business_id) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    (select count(*) from conversations c
      where c.business_id = p_business_id
        and c.last_message_at >= p_since),
    (select count(*) from appointments a
      where a.business_id = p_business_id
        and a.status <> 'cancelada'
        and a.starts_at >= p_week_from
        and a.starts_at < p_week_to),
    (select count(*) from appointments a
      where a.business_id = p_business_id
        and a.status <> 'cancelada'
        and a.starts_at >= p_today_from
        and a.starts_at < p_today_to),
    (select count(*) from conversations c
      where c.business_id = p_business_id
        and c.bot_active = false);
end;
$$;

-- Índices que sostienen los recuentos anteriores. Sin ellos, cada tarjeta
-- recorre la tabla entera en cuanto haya volumen real.
create index if not exists conversations_business_last_message_idx
  on conversations (business_id, last_message_at);

create index if not exists conversations_business_bot_active_idx
  on conversations (business_id, bot_active);

create index if not exists appointments_business_starts_at_idx
  on appointments (business_id, starts_at);
