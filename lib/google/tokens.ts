import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google/oauth";

export async function saveGoogleConnection({
  businessId,
  refreshToken,
  accountEmail,
}: {
  businessId: string;
  refreshToken: string;
  accountEmail: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      google_refresh_token: encryptSecret(refreshToken),
      google_account_email: accountEmail,
      google_calendar_connected: true,
    })
    .eq("id", businessId);

  if (error) throw error;
}

export async function disconnectGoogle(businessId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      google_refresh_token: null,
      google_account_email: null,
      google_calendar_connected: false,
      google_synced_at: null,
    })
    .eq("id", businessId);

  if (error) throw error;
}

/**
 * Access token válido para un negocio, o `null` si no tiene Google conectado.
 * Los access token de Google duran una hora, así que se pide uno nuevo en cada
 * uso en vez de guardarlo: es una llamada barata y evita cachés obsoletas.
 */
export async function getAccessToken(businessId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("businesses")
    .select("google_refresh_token")
    .eq("id", businessId)
    .limit(1);

  const encrypted = data?.[0]?.google_refresh_token as string | null | undefined;

  if (!encrypted) return null;

  try {
    const { accessToken } = await refreshAccessToken(decryptSecret(encrypted));
    return accessToken;
  } catch {
    // El usuario pudo revocar el acceso desde su cuenta de Google.
    return null;
  }
}
