import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import type { Business, BusinessHour, Service } from "@/lib/business";

const business: Business = {
  id: "b1",
  name: "Clínica Ejemplo",
  email: null,
  tone: "profesional y cálido",
  base_prompt: "",
  address: "Calle Falsa 123",
  description: null,
  ask_new_patient: true,
};

const hours: BusinessHour[] = [
  { id: "h1", day_of_week: 0, start_time: "09:00:00", end_time: "14:00:00" },
  { id: "h2", day_of_week: 0, start_time: "16:00:00", end_time: "20:00:00" },
];

const services: Service[] = [
  {
    id: "s1",
    slug: "limpieza",
    name: "Limpieza dental",
    description: "Revisión y limpieza",
    duration_minutes: 45,
  },
];

const nowIso = "2026-06-15T10:00:00.000Z";

describe("buildSystemPrompt", () => {
  it("usa el prompt por defecto cuando el negocio no tiene uno propio", () => {
    const prompt = buildSystemPrompt({
      business,
      hours,
      services,
      templates: {},
      nowIso,
    });
    expect(prompt).toContain("asistente virtual de atención al cliente");
  });

  it("respeta el prompt base del negocio cuando existe", () => {
    const prompt = buildSystemPrompt({
      business: { ...business, base_prompt: "Eres un recepcionista parco." },
      hours,
      services,
      templates: {},
      nowIso,
    });
    expect(prompt).toContain("Eres un recepcionista parco.");
    expect(prompt).not.toContain("asistente virtual de atención al cliente");
  });

  it("incluye varios rangos del mismo día y marca los días cerrados", () => {
    const prompt = buildSystemPrompt({
      business,
      hours,
      services,
      templates: {},
      nowIso,
    });
    expect(prompt).toContain("Lunes: 09:00-14:00, 16:00-20:00");
    expect(prompt).toContain("Martes: cerrado");
  });

  it("incluye los servicios con su id y duración", () => {
    const prompt = buildSystemPrompt({
      business,
      hours,
      services,
      templates: {},
      nowIso,
    });
    expect(prompt).toContain("Limpieza dental (id: limpieza, 45 min)");
  });

  it("omite la pregunta de cliente nuevo cuando está desactivada", () => {
    const prompt = buildSystemPrompt({
      business: { ...business, ask_new_patient: false },
      hours,
      services,
      templates: {},
      nowIso,
    });
    expect(prompt).not.toContain("cliente nuevo");
  });

  it("pone la hora actual al final, para no romper el caché del prefijo", () => {
    const prompt = buildSystemPrompt({
      business,
      hours,
      services,
      templates: {},
      nowIso,
    });
    expect(prompt.trimEnd().endsWith(`(interpreta las horas en Europe/Madrid).`)).toBe(
      true
    );
  });
});
