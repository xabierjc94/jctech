import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/lib/crypto";

const GRAPH_VERSION = "v21.0";

/**
 * Envía un mensaje de texto por la WhatsApp Cloud API con las credenciales del
 * negocio. Lanza si el negocio no tiene WhatsApp conectado o si Meta rechaza
 * la petición.
 */
export async function sendWhatsAppMessage({
  businessId,
  toPhone,
  text,
}: {
  businessId: string;
  toPhone: string;
  text: string;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("businesses")
    .select("whatsapp_phone_number_id, whatsapp_access_token")
    .eq("id", businessId)
    .limit(1);

  if (error) throw error;

  const row = data?.[0];

  if (!row?.whatsapp_phone_number_id || !row?.whatsapp_access_token) {
    throw new Error("El negocio no tiene WhatsApp conectado");
  }

  const token = decryptSecret(row.whatsapp_access_token as string);

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${row.whatsapp_phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: text },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`WhatsApp rechazó el envío (${response.status}): ${detail}`);
  }
}
