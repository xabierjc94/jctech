import type { Business, BusinessHour, Service } from "@/lib/business";

const DAY_NAMES = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const DEFAULT_BASE_PROMPT = `Eres el asistente virtual de atención al cliente por WhatsApp.

Tu papel:
- Saluda con amabilidad y entiende qué necesita la persona.
- Si quiere una cita, ayúdale a agendarla usando las herramientas disponibles.
- Pide los datos necesarios de uno en uno, con preguntas claras y breves.
- Confirma la cita SOLO cuando tengas todos los datos.
- Si la persona pide hablar con una persona, o no entiendes su intención tras dos intentos, usa la herramienta de transferencia.

Reglas estrictas:
- No inventes información sobre servicios, horarios ni disponibilidad: usa siempre los datos del negocio y las herramientas.
- No prometas horas sin haber consultado la disponibilidad.
- Responde en mensajes cortos, como en una conversación de WhatsApp.`;

function formatHours(hours: BusinessHour[]): string {
  if (hours.length === 0) return "No hay horarios configurados.";

  return DAY_NAMES.map((day, index) => {
    const ranges = hours
      .filter((hour) => hour.day_of_week === index)
      .map((hour) => `${hour.start_time.slice(0, 5)}-${hour.end_time.slice(0, 5)}`);

    return `${day}: ${ranges.length > 0 ? ranges.join(", ") : "cerrado"}`;
  }).join("\n");
}

function formatServices(services: Service[]): string {
  if (services.length === 0) return "No hay servicios configurados.";

  return services
    .map(
      (service) =>
        `- ${service.name} (id: ${service.slug}, ${service.duration_minutes} min)` +
        (service.description ? `: ${service.description}` : "")
    )
    .join("\n");
}

export function buildSystemPrompt({
  business,
  hours,
  services,
  templates,
  nowIso,
}: {
  business: Business;
  hours: BusinessHour[];
  services: Service[];
  templates: Record<string, string>;
  nowIso: string;
}): string {
  const base = business.base_prompt.trim() || DEFAULT_BASE_PROMPT;

  const sections = [
    base,
    `Tono: ${business.tone}.`,
    `Negocio: ${business.name}.`,
    business.address ? `Dirección: ${business.address}` : null,
    business.description ? `Sobre el negocio: ${business.description}` : null,
    `Servicios:\n${formatServices(services)}`,
    `Horario de atención (zona horaria Europe/Madrid):\n${formatHours(hours)}`,
    business.ask_new_patient
      ? "Al agendar, pregunta siempre si la persona es cliente nuevo."
      : null,
    templates.saludo ? `Mensaje de saludo sugerido: ${templates.saludo}` : null,
    templates.fuera_de_horario
      ? `Si escriben fuera de horario, usa esta idea: ${templates.fuera_de_horario}`
      : null,
    templates.confirmacion_cita
      ? `Al confirmar una cita, usa esta idea: ${templates.confirmacion_cita}`
      : null,
    templates.traspaso_humano
      ? `Al transferir a una persona, usa esta idea: ${templates.traspaso_humano}`
      : null,
    `Fecha y hora actual: ${nowIso} (interpreta las horas en Europe/Madrid).`,
  ].filter(Boolean);

  return sections.join("\n\n");
}
