import { createClient } from "@/lib/supabase/server";

export type BusinessMembership = {
  business_id: string;
  role: "owner" | "empleado";
  businesses: { id: string; name: string };
};

export async function getUserBusinesses(): Promise<BusinessMembership[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(id, name)");

  if (error) throw error;
  return (data ?? []) as unknown as BusinessMembership[];
}

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

export async function getActiveBusiness(): Promise<Business> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, email, tone, base_prompt, address, description, ask_new_patient"
    )
    .limit(1)
    .single();

  if (error) throw error;
  return data as Business;
}

export type BusinessHour = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export async function getBusinessHours(): Promise<BusinessHour[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("id, day_of_week, start_time, end_time")
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, slug, name, description, duration_minutes")
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("key, content");

  if (error) throw error;

  return Object.fromEntries(
    (data ?? []).map((row) => [row.key as string, row.content as string])
  );
}
