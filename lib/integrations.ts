import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";

export type IntegrationsStatus = {
  whatsappConnected: boolean;
  whatsappPhoneNumberId: string | null;
  googleConnected: boolean;
  googleAccountEmail: string | null;
  googleSyncedAt: string | null;
};

const EMPTY: IntegrationsStatus = {
  whatsappConnected: false,
  whatsappPhoneNumberId: null,
  googleConnected: false,
  googleAccountEmail: null,
  googleSyncedAt: null,
};

/**
 * Nunca devuelve los tokens, solo si hay conexión y los datos que se pueden
 * enseñar. Los tokens cifrados no deben salir de la capa de servidor.
 */
export async function getIntegrationsStatus(): Promise<IntegrationsStatus> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return EMPTY;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "whatsapp_connected, whatsapp_phone_number_id, google_calendar_connected, google_account_email, google_synced_at"
    )
    .eq("id", businessId)
    .limit(1);

  if (error) throw error;

  const row = data?.[0];
  if (!row) return EMPTY;

  return {
    whatsappConnected: Boolean(row.whatsapp_connected),
    whatsappPhoneNumberId: (row.whatsapp_phone_number_id as string) ?? null,
    googleConnected: Boolean(row.google_calendar_connected),
    googleAccountEmail: (row.google_account_email as string) ?? null,
    googleSyncedAt: (row.google_synced_at as string) ?? null,
  };
}
