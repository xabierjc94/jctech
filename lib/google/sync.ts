import { createServiceClient } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/google/tokens";
import { listEvents } from "@/lib/google/calendar";

/** No se sincroniza más de una vez cada dos minutos. */
const MIN_INTERVAL_MS = 2 * 60 * 1000;

/** Ventana que se trae de Google: un mes atrás y tres adelante. */
const BACK_DAYS = 30;
const AHEAD_DAYS = 90;

/**
 * Trae los eventos de Google a la tabla local. Es idempotente: los eventos ya
 * conocidos se actualizan por su `google_event_id` en vez de duplicarse.
 *
 * Devuelve `true` si llegó a sincronizar.
 */
export async function syncFromGoogle(
  businessId: string,
  { force = false }: { force?: boolean } = {}
): Promise<boolean> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("businesses")
    .select("google_calendar_connected, google_calendar_id, google_synced_at")
    .eq("id", businessId)
    .limit(1);

  const business = data?.[0];

  if (!business?.google_calendar_connected) return false;

  const syncedAt = business.google_synced_at as string | null;

  if (
    !force &&
    syncedAt &&
    Date.now() - new Date(syncedAt).getTime() < MIN_INTERVAL_MS
  ) {
    return false;
  }

  const accessToken = await getAccessToken(businessId);
  if (!accessToken) return false;

  const now = Date.now();
  const from = new Date(now - BACK_DAYS * 864e5);
  const to = new Date(now + AHEAD_DAYS * 864e5);

  let events;

  try {
    events = await listEvents({
      accessToken,
      calendarId: (business.google_calendar_id as string) ?? "primary",
      from,
      to,
    });
  } catch {
    return false;
  }

  // Todo va en lotes: con una escritura por evento, un calendario normal de
  // medio centenar de eventos tardaba diez segundos, y la pantalla de Citas
  // esperaba a que terminara.
  const cancelled = events.filter((e) => e.cancelled).map((e) => e.id);
  const active = events.filter((e) => !e.cancelled);

  // Las citas que agendó el agente ya tienen su evento en Google. Para ellas se
  // conservan el nombre del cliente y el origen; solo se refrescan hora y estado.
  const { data: agentRows } = await supabase
    .from("appointments")
    .select("google_event_id")
    .eq("business_id", businessId)
    .eq("source", "agente")
    .not("google_event_id", "is", null);

  const bookedByAgent = new Set(
    (agentRows ?? []).map((r) => r.google_event_id as string)
  );

  const fromGoogle = active
    .filter((e) => !bookedByAgent.has(e.id))
    .map((e) => ({
      business_id: businessId,
      google_event_id: e.id,
      contact_name: e.summary,
      starts_at: e.startsAt,
      ends_at: e.endsAt,
      status: "confirmada",
      source: "google",
    }));

  const fromAgent = active
    .filter((e) => bookedByAgent.has(e.id))
    .map((e) => ({
      business_id: businessId,
      google_event_id: e.id,
      starts_at: e.startsAt,
      ends_at: e.endsAt,
      status: "confirmada",
    }));

  if (cancelled.length > 0) {
    await supabase
      .from("appointments")
      .update({ status: "cancelada" })
      .eq("business_id", businessId)
      .in("google_event_id", cancelled);
  }

  // El índice único (business_id, google_event_id) hace que esto actualice
  // en vez de duplicar cuando el evento ya se conocía.
  if (fromGoogle.length > 0) {
    await supabase
      .from("appointments")
      .upsert(fromGoogle, { onConflict: "business_id,google_event_id" });
  }

  if (fromAgent.length > 0) {
    await supabase
      .from("appointments")
      .upsert(fromAgent, { onConflict: "business_id,google_event_id" });
  }

  await supabase
    .from("businesses")
    .update({ google_synced_at: new Date().toISOString() })
    .eq("id", businessId);

  return true;
}
