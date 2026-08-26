"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConversation } from "@/lib/conversations";

function fail(conversationId: string, message: string): never {
  redirect(
    `/conversaciones?c=${conversationId}&error=${encodeURIComponent(message)}`
  );
}

export async function toggleBot(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const nextValue = formData.get("next_value") === "true";

  if (!conversationId) {
    redirect("/conversaciones");
  }

  // Confirma que la conversación pertenece al negocio activo antes de escribir.
  const conversation = await getConversation(conversationId);

  if (!conversation) {
    redirect("/conversaciones");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ bot_active: nextValue })
    .eq("id", conversationId);

  if (error) {
    fail(conversationId, "No se pudo cambiar el estado del bot.");
  }

  revalidatePath("/conversaciones");
  revalidatePath("/dashboard");
  redirect(`/conversaciones?c=${conversationId}`);
}
