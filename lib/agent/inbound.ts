import { createServiceClient } from "@/lib/supabase/service";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { runAgent } from "@/lib/agent/run";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import type Anthropic from "@anthropic-ai/sdk";
import type { Business, BusinessHour, Service } from "@/lib/business";

/** Cuántos mensajes previos se le pasan al modelo como contexto. */
const HISTORY_LIMIT = 20;

export type InboundMessage = {
  phoneNumberId: string;
  fromPhone: string;
  contactName: string | null;
  text: string;
};

export async function handleInboundMessage(inbound: InboundMessage) {
  const supabase = createServiceClient();

  const { data: businessRow } = await supabase
    .from("businesses")
    .select(
      "id, name, email, tone, base_prompt, address, description, ask_new_patient"
    )
    .eq("whatsapp_phone_number_id", inbound.phoneNumberId)
    .limit(1);

  const business = businessRow?.[0] as Business | undefined;

  if (!business) {
    // Mensaje para un número que no está asociado a ningún negocio: se ignora.
    return;
  }

  const { data: existing } = await supabase
    .from("conversations")
    .select("id, bot_active")
    .eq("business_id", business.id)
    .eq("contact_phone", inbound.fromPhone)
    .limit(1);

  let conversationId = existing?.[0]?.id as string | undefined;
  let botActive = (existing?.[0]?.bot_active as boolean | undefined) ?? true;

  if (!conversationId) {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        business_id: business.id,
        contact_phone: inbound.fromPhone,
        contact_name: inbound.contactName,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !created) return;

    conversationId = created.id as string;
    botActive = true;
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "cliente",
    content: inbound.text,
  });

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (!botActive) {
    // Conversación en manos de una persona: se registra y no se responde.
    return;
  }

  const [{ data: hoursData }, { data: servicesData }, { data: templatesData }] =
    await Promise.all([
      supabase
        .from("business_hours")
        .select("id, day_of_week, start_time, end_time")
        .eq("business_id", business.id)
        .order("day_of_week")
        .order("start_time"),
      supabase
        .from("services")
        .select("id, slug, name, description, duration_minutes")
        .eq("business_id", business.id)
        .order("name"),
      supabase
        .from("message_templates")
        .select("key, content")
        .eq("business_id", business.id),
    ]);

  const hours = (hoursData ?? []) as BusinessHour[];
  const services = (servicesData ?? []) as Service[];
  const templates = Object.fromEntries(
    (templatesData ?? []).map((row) => [row.key as string, row.content as string])
  );

  const { data: historyRows } = await supabase
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const history = (historyRows ?? []).slice().reverse();

  const messages: Anthropic.MessageParam[] = history.map((row) => ({
    role: row.sender === "cliente" ? ("user" as const) : ("assistant" as const),
    content: row.content as string,
  }));

  const now = new Date();

  const reply = await runAgent({
    systemPrompt: buildSystemPrompt({
      business,
      hours,
      services,
      templates,
      nowIso: now.toISOString(),
    }),
    messages,
    context: {
      businessId: business.id,
      conversationId,
      contactPhone: inbound.fromPhone,
      hours,
      services,
      dryRun: false,
      now,
    },
  });

  if (!reply.text) return;

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "agente_ia",
    content: reply.text,
  });

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  await sendWhatsAppMessage({
    businessId: business.id,
    toPhone: inbound.fromPhone,
    text: reply.text,
  });
}
