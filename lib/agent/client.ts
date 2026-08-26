import Anthropic from "@anthropic-ai/sdk";

export const AGENT_MODEL = "claude-opus-5";

// Respuestas de WhatsApp: cortas y con baja latencia. El esfuerzo es lo que
// se ajusta si el agente se queda corto razonando sobre disponibilidad.
export const AGENT_EFFORT = "low" as const;
export const AGENT_MAX_TOKENS = 2048;

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!cached) {
    cached = new Anthropic();
  }
  return cached;
}
