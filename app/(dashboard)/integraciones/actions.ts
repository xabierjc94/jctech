"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusinessId } from "@/lib/business";
import { disconnectGoogle } from "@/lib/google/tokens";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/crypto";

const MAX_PHONE_ID_LENGTH = 40;
const MAX_TOKEN_LENGTH = 500;

function fail(tab: string, message: string): never {
  redirect(`/integraciones?tab=${tab}&error=${encodeURIComponent(message)}`);
}

function done(tab: string): never {
  revalidatePath("/integraciones");
  redirect(`/integraciones?tab=${tab}&ok=1`);
}

export async function desconectarGoogle() {
  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("conexiones", "No se pudo desconectar. Inténtalo de nuevo.");
  }

  try {
    await disconnectGoogle(businessId);
  } catch {
    fail("conexiones", "No se pudo desconectar. Inténtalo de nuevo.");
  }

  done("conexiones");
}

export async function guardarWhatsApp(formData: FormData) {
  const phoneNumberId = String(formData.get("phone_number_id") ?? "").trim();
  const accessToken = String(formData.get("access_token") ?? "").trim();

  if (!phoneNumberId || phoneNumberId.length > MAX_PHONE_ID_LENGTH) {
    fail("conexiones", "Introduce un Phone Number ID válido.");
  }

  if (!/^\d+$/.test(phoneNumberId)) {
    fail("conexiones", "El Phone Number ID solo contiene dígitos.");
  }

  if (!accessToken || accessToken.length > MAX_TOKEN_LENGTH) {
    fail("conexiones", "Introduce un token de acceso válido.");
  }

  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("conexiones", "No se pudo guardar. Inténtalo de nuevo.");
  }

  // service_role porque el token va cifrado y no debe pasar por el cliente.
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_access_token: encryptSecret(accessToken),
      whatsapp_connected: true,
    })
    .eq("id", businessId);

  if (error) {
    fail("conexiones", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("conexiones");
}

export async function desconectarWhatsApp() {
  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("conexiones", "No se pudo desconectar. Inténtalo de nuevo.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      whatsapp_connected: false,
    })
    .eq("id", businessId);

  if (error) {
    fail("conexiones", "No se pudo desconectar. Inténtalo de nuevo.");
  }

  done("conexiones");
}
