-- El índice de la migración 0005 era parcial (`where google_event_id is not
-- null`). Postgres solo admite un índice parcial como árbitro de ON CONFLICT si
-- la sentencia repite ese mismo predicado, y supabase-js no lo emite: el upsert
-- de la sincronización fallaba siempre con 42P10.
--
-- Un índice único normal da exactamente la misma garantía aquí, porque Postgres
-- no considera iguales dos NULL: varias citas locales sin evento de Google
-- siguen conviviendo sin chocar.
drop index if exists appointments_business_google_event_idx;

create unique index appointments_business_google_event_idx
  on appointments (business_id, google_event_id);
