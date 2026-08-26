import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { findAvailableSlots, MAX_LOOKAHEAD_DAYS } from "@/lib/agent/availability";
import { formatDateTime } from "@/lib/dates";
import type { BusinessHour, Service } from "@/lib/business";

const MAX_SLOTS_OFFERED = 3;

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "consultar_disponibilidad",
    description:
      "Devuelve los próximos huecos libres para un servicio, respetando el horario del negocio y las citas ya ocupadas. Úsala siempre antes de proponer una hora.",
    input_schema: {
      type: "object",
      properties: {
        servicio_id: {
          type: "string",
          description: "El id interno del servicio, tal y como aparece en la lista de servicios.",
        },
      },
      required: ["servicio_id"],
      additionalProperties: false,
    },
  },
  {
    name: "agendar_cita",
    description:
      "Reserva una cita en un hueco previamente confirmado como libre. Úsala solo cuando tengas el servicio, la hora exacta y el nombre de la persona.",
    input_schema: {
      type: "object",
      properties: {
        servicio_id: { type: "string", description: "El id interno del servicio." },
        inicio: {
          type: "string",
          description:
            "Instante de inicio en formato ISO 8601 con zona (por ejemplo 2026-06-15T09:00:00.000Z), tal y como lo devolvió consultar_disponibilidad.",
        },
        nombre: { type: "string", description: "Nombre de la persona que reserva." },
      },
      required: ["servicio_id", "inicio", "nombre"],
      additionalProperties: false,
    },
  },
  {
    name: "transferir_a_humano",
    description:
      "Pasa la conversación a una persona del equipo y deja de responder automáticamente. Úsala si lo piden explícitamente o si no entiendes la intención tras dos intentos.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Motivo breve del traspaso." },
      },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

export type ToolContext = {
  businessId: string;
  conversationId: string | null;
  contactPhone: string | null;
  hours: BusinessHour[];
  services: Service[];
  /** En modo prueba no se escribe nada en la base de datos. */
  dryRun: boolean;
  now: Date;
};

export type ToolOutcome = {
  content: string;
  /** El agente pidió ceder el turno a una persona. */
  handoff?: boolean;
};

async function loadBusy(businessId: string, from: Date): Promise<
  { starts_at: string; ends_at: string }[]
> {
  const supabase = createServiceClient();
  const until = new Date(
    from.getTime() + MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000
  );

  const { data, error } = await supabase
    .from("appointments")
    .select("starts_at, ends_at")
    .eq("business_id", businessId)
    .neq("status", "cancelada")
    .gte("starts_at", from.toISOString())
    .lt("starts_at", until.toISOString());

  if (error) throw error;
  return data ?? [];
}

export async function runTool(
  name: string,
  input: unknown,
  context: ToolContext
): Promise<ToolOutcome> {
  const args = (input ?? {}) as Record<string, unknown>;

  if (name === "consultar_disponibilidad") {
    const service = context.services.find((s) => s.slug === args.servicio_id);

    if (!service) {
      return {
        content: `No existe un servicio con id "${String(args.servicio_id)}". Servicios disponibles: ${context.services
          .map((s) => s.slug)
          .join(", ")}`,
      };
    }

    const busy = context.dryRun ? [] : await loadBusy(context.businessId, context.now);

    const slots = findAvailableSlots({
      hours: context.hours,
      busy,
      durationMinutes: service.duration_minutes,
      from: context.now,
      limit: MAX_SLOTS_OFFERED,
    });

    if (slots.length === 0) {
      return { content: "No hay huecos libres en los próximos 30 días." };
    }

    const lines = slots.map(
      (slot) => `- ${formatDateTime(slot.startsAt)} (inicio: ${slot.startsAt.toISOString()})`
    );

    return {
      content: `Huecos libres para ${service.name}:\n${lines.join("\n")}`,
    };
  }

  if (name === "agendar_cita") {
    const service = context.services.find((s) => s.slug === args.servicio_id);

    if (!service) {
      return { content: `No existe un servicio con id "${String(args.servicio_id)}".` };
    }

    const startsAt = new Date(String(args.inicio));

    if (Number.isNaN(startsAt.getTime())) {
      return { content: "La fecha de inicio no es válida. Usa el formato ISO 8601." };
    }

    if (startsAt.getTime() < context.now.getTime()) {
      return { content: "Esa hora ya ha pasado. Consulta la disponibilidad de nuevo." };
    }

    const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60000);

    if (context.dryRun) {
      return {
        content: `[modo prueba] Cita simulada: ${service.name} el ${formatDateTime(startsAt)}. No se ha guardado nada.`,
      };
    }

    // Se revalida el hueco: entre la consulta y la reserva puede haberse ocupado.
    const busy = await loadBusy(context.businessId, context.now);
    const stillFree = findAvailableSlots({
      hours: context.hours,
      busy,
      durationMinutes: service.duration_minutes,
      from: context.now,
      limit: 200,
    }).some((slot) => slot.startsAt.getTime() === startsAt.getTime());

    if (!stillFree) {
      return {
        content: "Ese hueco ya no está libre. Consulta la disponibilidad de nuevo.",
      };
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("appointments").insert({
      business_id: context.businessId,
      conversation_id: context.conversationId,
      service_id: service.id,
      contact_name: String(args.nombre ?? ""),
      contact_phone: context.contactPhone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "confirmada",
    });

    if (error) {
      return { content: "No se pudo guardar la cita. Pide disculpas y ofrece otra hora." };
    }

    // TODO (Fase 5): crear también el evento en Google Calendar.

    return {
      content: `Cita confirmada: ${service.name} el ${formatDateTime(startsAt)}.`,
    };
  }

  if (name === "transferir_a_humano") {
    if (!context.dryRun && context.conversationId) {
      const supabase = createServiceClient();
      await supabase
        .from("conversations")
        .update({ bot_active: false })
        .eq("id", context.conversationId);
    }

    return {
      content: "Conversación transferida a una persona del equipo.",
      handoff: true,
    };
  }

  return { content: `Herramienta desconocida: ${name}` };
}
