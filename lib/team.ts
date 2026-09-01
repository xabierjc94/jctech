import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";

export type TeamMember = {
  user_id: string;
  email: string | null;
  role: "owner" | "empleado";
  created_at: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: "owner" | "empleado";
  created_at: string;
};

export const getTeamMembers = cache(async function getTeamMembers(): Promise<
  TeamMember[]
> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("user_id, email, role, created_at")
    .eq("business_id", businessId)
    .order("created_at");

  if (error) throw error;
  return (data ?? []) as TeamMember[];
});

export async function getInvitations(): Promise<Invitation[]> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_invitations")
    .select("id, email, role, created_at")
    .eq("business_id", businessId)
    .order("created_at");

  if (error) throw error;
  return (data ?? []) as Invitation[];
}

/** Rol del usuario actual en el negocio activo. */
export async function getMyRole(): Promise<"owner" | "empleado" | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const members = await getTeamMembers();
  return members.find((m) => m.user_id === user.id)?.role ?? null;
}
