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
