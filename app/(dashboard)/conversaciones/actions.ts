"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConversation } from "@/lib/conversations";
import { getActiveBusinessId } from "@/lib/business";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";

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

const MAX_MESSAGE_LENGTH = 1000;

export async function sendHumanMessage(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "");
  const content = String(formData.get("content") ?? "").trim();

  if (!conversationId) {
    redirect("/conversaciones");
  }

  if (!content) {
    fail(conversationId, "Escribe un mensaje antes de enviarlo.");
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    fail(
      conversationId,
      `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`
    );
  }

  // Confirma que la conversación pertenece al negocio activo antes de escribir.
  const conversation = await getConversation(conversationId);

  if (!conversation) {
    redirect("/conversaciones");
  }

  const supabase = await createClient();
  const sentAt = new Date().toISOString();

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "humano",
    content,
    created_at: sentAt,
  });

  if (messageError) {
    fail(conversationId, "No se pudo enviar el mensaje.");
  }

  // Responder a mano pausa el bot: a partir de aquí atiende una persona.
  const { error: conversationError } = await supabase
    .from("conversations")
    .update({ bot_active: false, last_message_at: sentAt })
    .eq("id", conversationId);

  if (conversationError) {
    fail(conversationId, "No se pudo enviar el mensaje.");
  }

  // El envío por WhatsApp no debe tumbar el guardado: si Meta falla, el
  // mensaje ya está registrado y se avisa al usuario.
  const businessId = await getActiveBusinessId();

  if (businessId) {
    try {
      await sendWhatsAppMessage({
        businessId,
        toPhone: conversation.contact_phone,
        text: content,
      });
    } catch (error) {
      // Sin esto, un fallo de envío sería invisible en producción. El mensaje
      // de error de sendWhatsAppMessage no incluye el token.
      console.error("Fallo al enviar por WhatsApp:", error);
      revalidatePath("/conversaciones");
      fail(
        conversationId,
        "El mensaje se guardó, pero no se pudo enviar por WhatsApp."
      );
    }
  }

  revalidatePath("/conversaciones");
  revalidatePath("/dashboard");
  redirect(`/conversaciones?c=${conversationId}`);
}
