import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { readActiveBusinessId } from "@/lib/active-business";

export type BusinessMembership = {
  business_id: string;
  role: "owner" | "empleado";
  businesses: { id: string; name: string };
};

export const getUserBusinesses = cache(async function getUserBusinesses(): Promise<BusinessMembership[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(id, name)");

  if (error) throw error;
  return (data ?? []) as unknown as BusinessMembership[];
});

export type Business = {
  id: string;
  name: string;
  email: string | null;
  tone: string;
  base_prompt: string;
  address: string | null;
  description: string | null;
  ask_new_patient: boolean;
};

const BUSINESS_COLUMNS =
  "id, name, email, tone, base_prompt, address, description, ask_new_patient";

export const getActiveBusiness = cache(async function getActiveBusiness(): Promise<Business> {
  const supabase = await createClient();
  const activeId = await readActiveBusinessId();

  if (activeId) {
    const { data } = await supabase
      .from("businesses")
      .select(BUSINESS_COLUMNS)
      .eq("id", activeId)
      .limit(1);

    if (data && data.length > 0) return data[0] as Business;
    // Cookie obsoleta: se ignora y se cae al primer negocio del usuario.
  }

  // RLS ya limita el conjunto a los negocios de los que el usuario es miembro.
  const { data, error } = await supabase
    .from("businesses")
    .select(BUSINESS_COLUMNS)
    .order("created_at")
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Sin negocio activo");

  return data[0] as Business;
});

/**
 * Id del negocio activo, resuelto igual que `getActiveBusiness` pero sin traer
 * la fila entera. Devuelve `null` en vez de lanzar, para que las Server Actions
 * puedan responder con su propio mensaje de error.
 */
export const getActiveBusinessId = cache(async function getActiveBusinessId(): Promise<string | null> {
  const supabase = await createClient();
  const activeId = await readActiveBusinessId();

  if (activeId) {
    const { data } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", activeId)
      .limit(1);

    if (data && data.length > 0) return data[0].id as string;
    // Cookie obsoleta (negocio borrado o ya no accesible): se ignora y se cae
    // al primer negocio del usuario, igual que hace el layout del dashboard.
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .order("created_at")
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return data[0].id as string;
});

export type BusinessHour = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export async function getBusinessHours(): Promise<BusinessHour[]> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("id, day_of_week, start_time, end_time")
    .eq("business_id", businessId)
    .order("day_of_week")
    .order("start_time");

  if (error) throw error;
  return (data ?? []) as BusinessHour[];
}

export type Service = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  duration_minutes: number;
};

export async function getServices(): Promise<Service[]> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, slug, name, description, duration_minutes")
    .eq("business_id", businessId)
    .order("name");

  if (error) throw error;
  return (data ?? []) as Service[];
}

export const MESSAGE_TEMPLATES = [
  {
    key: "saludo",
    label: "Saludo inicial",
    hint: "Primer mensaje cuando alguien escribe por primera vez.",
  },
  {
    key: "fuera_de_horario",
    label: "Fuera de horario",
    hint: "Respuesta cuando escriben fuera del horario de atención.",
  },
  {
    key: "confirmacion_cita",
    label: "Confirmación de cita",
    hint: "Mensaje al confirmar una cita agendada.",
  },
  {
    key: "traspaso_humano",
    label: "Traspaso a persona",
    hint: "Mensaje al pasar la conversación a una persona del equipo.",
  },
] as const;

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATES)[number]["key"];

export async function getMessageTemplates(): Promise<Record<string, string>> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("key, content")
    .eq("business_id", businessId);

  if (error) throw error;

  return Object.fromEntries(
    (data ?? []).map((row) => [row.key as string, row.content as string])
  );
}
