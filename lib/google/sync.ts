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

  for (const event of events) {
    if (event.cancelled) {
      await supabase
        .from("appointments")
        .update({ status: "cancelada" })
        .eq("business_id", businessId)
        .eq("google_event_id", event.id);
      continue;
    }

    // El índice único (business_id, google_event_id) hace que esto actualice
    // en vez de duplicar cuando el evento ya se conocía.
    await supabase.from("appointments").upsert(
      {
        business_id: businessId,
        google_event_id: event.id,
        contact_name: event.summary,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        status: "confirmada",
        source: "google",
      },
      { onConflict: "business_id,google_event_id" }
    );
  }

  await supabase
    .from("businesses")
    .update({ google_synced_at: new Date().toISOString() })
    .eq("id", businessId);

  return true;
}
