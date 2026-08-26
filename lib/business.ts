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
