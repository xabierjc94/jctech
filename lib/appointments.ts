import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";
import { monthRange } from "@/lib/dates";

export type Appointment = {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  starts_at: string;
  ends_at: string;
  status: "confirmada" | "cancelada" | "completada";
  source: "agente" | "google" | "panel";
};

export async function getMonthAppointments(
  year: number,
  month: number
): Promise<Appointment[]> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const { from, to } = monthRange(year, month);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, contact_name, contact_phone, starts_at, ends_at, status, source")
    .eq("business_id", businessId)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at");

  if (error) throw error;
  return (data ?? []) as Appointment[];
}
