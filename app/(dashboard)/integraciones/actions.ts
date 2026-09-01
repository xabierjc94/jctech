"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusinessId } from "@/lib/business";
import { disconnectGoogle } from "@/lib/google/tokens";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import { getMyRole } from "@/lib/team";

const MAX_PHONE_ID_LENGTH = 40;
const MAX_TOKEN_LENGTH = 500;
const MAX_EMAIL_LENGTH = 200;

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

export async function invitar(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
    fail("equipo", "Introduce un email válido.");
  }

  if ((await getMyRole()) !== "owner") {
    fail("equipo", "Solo el propietario puede invitar a alguien.");
  }

  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("equipo", "No se pudo invitar. Inténtalo de nuevo.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("business_invitations").insert({
    business_id: businessId,
    email,
    invited_by: user?.id ?? null,
  });

  if (error) {
    fail(
      "equipo",
      error.code === "23505"
        ? "Ya has invitado a esa persona."
        : "No se pudo invitar. Inténtalo de nuevo."
    );
  }

  done("equipo");
}

export async function revocarInvitacion(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  if (!id || (await getMyRole()) !== "owner") {
    fail("equipo", "No se pudo revocar la invitación.");
  }

  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("equipo", "No se pudo revocar la invitación.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_invitations")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) {
    fail("equipo", "No se pudo revocar la invitación.");
  }

  done("equipo");
}

export async function quitarMiembro(formData: FormData) {
  const userId = String(formData.get("user_id") ?? "");

  if (!userId || (await getMyRole()) !== "owner") {
    fail("equipo", "No se pudo quitar a esa persona.");
  }

  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("equipo", "No se pudo quitar a esa persona.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Quitarse a uno mismo dejaría el negocio sin dueño y sin forma de volver.
  if (user?.id === userId) {
    fail("equipo", "No puedes quitarte a ti mismo del negocio.");
  }

  const { error } = await supabase
    .from("business_members")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", userId);

  if (error) {
    fail("equipo", "No se pudo quitar a esa persona.");
  }

  done("equipo");
}
