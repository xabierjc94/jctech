import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";

export type Conversation = {
  id: string;
  contact_name: string | null;
  contact_phone: string;
  bot_active: boolean;
  last_message_at: string;
};

export type Message = {
  id: string;
  sender: "cliente" | "agente_ia" | "humano";
  content: string;
  created_at: string;
};

export async function getConversations(
  limit?: number
): Promise<Conversation[]> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select("id, contact_name, contact_phone, bot_active, last_message_at")
    .eq("business_id", businessId)
    .order("last_message_at", { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function getConversation(
  id: string
): Promise<Conversation | null> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, contact_name, contact_phone, bot_active, last_message_at")
    .eq("business_id", businessId)
    .eq("id", id)
    .limit(1);

  if (error) throw error;
  return (data?.[0] as Conversation) ?? null;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  // La conversación se resuelve primero para confirmar que pertenece al
  // negocio activo; así un id de otro negocio del usuario no filtra mensajes.
  const conversation = await getConversation(conversationId);
  if (!conversation) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at");

  if (error) throw error;
  return (data ?? []) as Message[];
}
