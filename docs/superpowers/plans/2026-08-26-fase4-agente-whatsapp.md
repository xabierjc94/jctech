# Panel de clientes — Fase 4: Agente de WhatsApp con Claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente escriba por WhatsApp al negocio y el agente de Claude le responda solo: entienda qué necesita, consulte huecos libres según los horarios y las citas ya existentes, agende la cita, y ceda el turno a una persona cuando corresponda — todo visible en el panel y configurable desde Personalización.

**Architecture:** Un módulo de agente (`lib/agent/`) independiente del transporte: recibe el historial de una conversación y devuelve la respuesta, ejecutando herramientas en un bucle controlado. Dos transportes lo usan: el **webhook de WhatsApp** (producción) y la **pantalla "Probar agente"** (pruebas, sin tocar WhatsApp ni crear citas reales). La disponibilidad se calcula con una función pura sobre horarios y citas, lo que permite probarla con tests unitarios.

**Tech Stack:** Next.js 16 (Route Handlers, Server Actions), TypeScript, `@anthropic-ai/sdk` con **Claude Opus 5**, Supabase (Postgres + RLS), WhatsApp Cloud API (Meta).

> **Restricción de Next.js vigente:** un archivo con `"use server"` **solo puede exportar funciones async**. `tsc` no lo detecta; solo `next build`.

> **Entorno de verificación:** **Supabase en la nube** (sin Docker). Navegador: puerto **3005** y **build de producción** (`npm run build && npx next start -p 3005`) — en `next dev` las Server Actions fallan con `E394`. Usuario de prueba: `dev@jctech.local` / `DevPanel1234!` (negocio `caadda18-f2df-4728-8050-186222074a31`). El panel del navegador no compone frames: usa `javascript_tool` y `.click()` sobre botones reales. Consultas a la base: script Node temporal en `.scratch/` con la service_role key; bórralo al terminar. **Para parar el servidor, mata el PID del puerto 3005 — nunca `taskkill /F /IM node.exe`**, que tumbaría otros proyectos del usuario.

**Ver también:**
- Spec: `docs/superpowers/specs/2026-08-18-panel-clientes-design.md` (sección 5: Agente de IA)
- Fases 1-3: `docs/superpowers/plans/2026-08-1[8]-fase1-*.md`, `...-fase2-*.md`, `...-fase3-*.md`

---

## Contexto heredado

- **Esquema**: `businesses` (con `tone`, `base_prompt`, `ask_new_patient`, `whatsapp_phone_number_id`, `whatsapp_access_token`), `business_hours`, `services`, `message_templates`, `conversations` (`bot_active`), `messages` (`sender`: `cliente`/`agente_ia`/`humano`), `appointments`.
- **Helpers**: `lib/business.ts` (`getActiveBusiness`, `getActiveBusinessId`, `getBusinessHours`, `getServices`, `getMessageTemplates`), `lib/conversations.ts`, `lib/metrics.ts`, `lib/dates.ts` (`todayRange`, `weekRange`, `daysAgo`, `formatTime`, `formatShortDate`, zona `Europe/Madrid`).
- **Convención de días**: `day_of_week` 0 = lunes … 6 = domingo.
- **Convenciones**: validación en servidor antes de tocar la red, constantes con nombre, mensajes de error genéricos por `?error=`, `revalidatePath` tras escribir.

## Decisiones de alcance

- **La disponibilidad se calcula sobre `business_hours` + `appointments` locales**, no sobre Google Calendar. El spec marca Google Calendar como fuente de verdad, pero eso es la Fase 5: hacer que la Fase 4 dependa de ella bloquearía todo el agente. La Fase 5 sustituirá la comprobación de huecos por Google Calendar y sincronizará en ambos sentidos; el punto de sustitución es una sola función (`findAvailableSlots`).
- **El agente solo responde a conversaciones con `bot_active = true`.** Si está en pausa, el mensaje entrante se guarda y no se responde.
- **Fuera de alcance:** alta y verificación del número ante Meta (manual, lo hace el negocio), la pestaña de Integraciones para pegar credenciales por interfaz (Fase 6; aquí se cargan con un script), y mensajes que no sean texto (audios, imágenes, ubicaciones) — se registran pero el agente responde pidiendo texto.

## Credenciales necesarias

| Variable | Para qué | Cuándo |
|---|---|---|
| `ANTHROPIC_API_KEY` | Llamar a Claude | Tarea 1 |
| `WHATSAPP_VERIFY_TOKEN` | Cadena que eliges tú; Meta la usa para validar el webhook | Tarea 7 |
| `WHATSAPP_APP_SECRET` | Verificar la firma `X-Hub-Signature-256` de Meta | Tarea 7 |
| `CREDENTIALS_SECRET` | Clave de cifrado de los tokens guardados en base | Tarea 6 |

Las de WhatsApp del negocio (`whatsapp_phone_number_id`, `whatsapp_access_token`) van en la tabla `businesses`, cifradas.

---

### Task 1: Cliente de Claude y prompt del sistema

**Files:**
- Create: `lib/agent/client.ts`, `lib/agent/prompt.ts`, `tests/prompt.test.ts`
- Modify: `package.json`, `.env.local.example`

- [ ] **Step 1: Instalar el SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Crear el cliente**

`lib/agent/client.ts`:

```ts
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
```

Nota: `new Anthropic()` resuelve `ANTHROPIC_API_KEY` del entorno; no se pasa la clave a mano.

- [ ] **Step 3: Crear el constructor del prompt**

`lib/agent/prompt.ts`:

```ts
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
```

Nota de caché: el prompt se ordena de lo estable a lo volátil — `nowIso` va al final para no invalidar el prefijo cacheado en cada mensaje.

- [ ] **Step 4: Escribir los tests**

`tests/prompt.test.ts`:

```ts
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
```

- [ ] **Step 5: Añadir la variable al ejemplo de entorno**

En `.env.local.example`, añade al final:

```bash
ANTHROPIC_API_KEY=
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

Expected: build correcto y **15 tests en verde** (2 RLS + 7 fechas + 6 del prompt).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Añade el cliente de Claude y el constructor del prompt del agente"
```

---

### Task 2: Cálculo de disponibilidad

Función pura sobre horarios y citas: es la pieza con más lógica de la fase y la única fácilmente testeable en aislamiento.

**Files:**
- Create: `lib/agent/availability.ts`, `tests/availability.test.ts`
- Modify: `lib/dates.ts`

- [ ] **Step 1: Exportar el constructor de instantes de `lib/dates.ts`**

En `lib/dates.ts`, la función interna `zonedMidnight` ya resuelve el desplazamiento horario. Generalízala y expórtala. Sustituye la definición actual de `zonedMidnight` por:

```ts
/** Instante UTC correspondiente a una hora local de Madrid. */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = offsetMinutes(guess);
  const adjusted = new Date(guess.getTime() - offset * 60000);
  // Segunda pasada: cubre los días de cambio de hora, en los que el
  // desplazamiento del instante ajustado difiere del de la estimación.
  const secondOffset = offsetMinutes(adjusted);
  return secondOffset === offset
    ? adjusted
    : new Date(guess.getTime() - secondOffset * 60000);
}

function zonedMidnight(year: number, month: number, day: number): Date {
  return zonedInstant(year, month, day);
}
```

Añade también, al final del archivo, un ayudante para leer las partes locales de un instante (lo necesita el cálculo de huecos):

```ts
/** Partes locales de Madrid de un instante: año, mes, día y día de semana 0=lunes. */
export function zonedParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
} {
  const p = partsIn(instant);
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    dayOfWeek: WEEKDAY_INDEX[p.weekday] ?? 0,
  };
}
```

Los tests existentes de `lib/dates.ts` deben seguir pasando sin cambios.

- [ ] **Step 2: Escribir el cálculo de huecos**

`lib/agent/availability.ts`:

```ts
import { zonedInstant, zonedParts } from "@/lib/dates";
import type { BusinessHour } from "@/lib/business";

export type Busy = { starts_at: string; ends_at: string };

export type Slot = { startsAt: Date; endsAt: Date };

/** Granularidad de los huecos ofrecidos, en minutos. */
export const SLOT_STEP_MINUTES = 15;

/** Días naturales que se exploran hacia delante como máximo. */
export const MAX_LOOKAHEAD_DAYS = 30;

function overlaps(slot: Slot, busy: Busy): boolean {
  const busyStart = new Date(busy.starts_at).getTime();
  const busyEnd = new Date(busy.ends_at).getTime();
  return slot.startsAt.getTime() < busyEnd && busyStart < slot.endsAt.getTime();
}

/**
 * Huecos libres para un servicio, respetando los horarios de atención y las
 * citas ya ocupadas. Todo el cálculo se hace en hora local de Madrid y se
 * devuelve en instantes UTC.
 */
export function findAvailableSlots({
  hours,
  busy,
  durationMinutes,
  from,
  limit,
  lookaheadDays = MAX_LOOKAHEAD_DAYS,
}: {
  hours: BusinessHour[];
  busy: Busy[];
  durationMinutes: number;
  from: Date;
  limit: number;
  lookaheadDays?: number;
}): Slot[] {
  const slots: Slot[] = [];
  const start = zonedParts(from);

  for (let offset = 0; offset < lookaheadDays && slots.length < limit; offset++) {
    // zonedInstant normaliza los desbordes de día, así que sumar es seguro.
    const dayInstant = zonedInstant(
      start.year,
      start.month,
      start.day + offset
    );
    const day = zonedParts(dayInstant);
    const dayHours = hours.filter((hour) => hour.day_of_week === day.dayOfWeek);

    for (const range of dayHours) {
      const [startHour, startMinute] = range.start_time.split(":").map(Number);
      const [endHour, endMinute] = range.end_time.split(":").map(Number);

      const rangeStart = zonedInstant(
        day.year,
        day.month,
        day.day,
        startHour,
        startMinute
      );
      const rangeEnd = zonedInstant(
        day.year,
        day.month,
        day.day,
        endHour,
        endMinute
      );

      for (
        let cursor = rangeStart.getTime();
        cursor + durationMinutes * 60000 <= rangeEnd.getTime();
        cursor += SLOT_STEP_MINUTES * 60000
      ) {
        if (slots.length >= limit) break;

        const slot: Slot = {
          startsAt: new Date(cursor),
          endsAt: new Date(cursor + durationMinutes * 60000),
        };

        if (slot.startsAt.getTime() < from.getTime()) continue;
        if (busy.some((entry) => overlaps(slot, entry))) continue;

        slots.push(slot);
      }
    }
  }

  return slots;
}
```

- [ ] **Step 3: Escribir los tests**

`tests/availability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findAvailableSlots } from "@/lib/agent/availability";
import type { BusinessHour } from "@/lib/business";

// 2026-06-15 es lunes. day_of_week 0 = lunes.
const mondayHours: BusinessHour[] = [
  { id: "h1", day_of_week: 0, start_time: "09:00:00", end_time: "11:00:00" },
];

// 09:00 en Madrid en junio (UTC+2) = 07:00 UTC.
const mondayMorning = new Date("2026-06-15T06:00:00Z");

describe("findAvailableSlots", () => {
  it("genera huecos dentro del horario, en hora de Madrid", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 60,
      from: mondayMorning,
      limit: 3,
    });

    expect(slots).toHaveLength(3);
    expect(slots[0].startsAt.toISOString()).toBe("2026-06-15T07:00:00.000Z");
    expect(slots[0].endsAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
    // Granularidad de 15 minutos.
    expect(slots[1].startsAt.toISOString()).toBe("2026-06-15T07:15:00.000Z");
  });

  it("no ofrece huecos que se salgan del cierre", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 60,
      from: mondayMorning,
      limit: 50,
    });

    const last = slots[slots.length - 1];
    // El último hueco de 60 min debe terminar justo a las 11:00 Madrid (09:00 UTC).
    expect(last.endsAt.toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("excluye los huecos que solapan con una cita existente", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [
        {
          starts_at: "2026-06-15T07:00:00.000Z",
          ends_at: "2026-06-15T08:00:00.000Z",
        },
      ],
      durationMinutes: 60,
      from: mondayMorning,
      limit: 1,
    });

    // Las 09:00 y las 09:15 Madrid solapan con la cita; el primer libre
    // empieza cuando la cita termina.
    expect(slots[0].startsAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });

  it("no ofrece huecos en el pasado", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 60,
      // 10:00 Madrid: las 09:00 ya han pasado.
      from: new Date("2026-06-15T08:00:00Z"),
      limit: 1,
    });

    expect(slots[0].startsAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });

  it("salta los días cerrados y encuentra el siguiente día abierto", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 60,
      // Martes: cerrado. El siguiente lunes es el 22 de junio.
      from: new Date("2026-06-16T06:00:00Z"),
      limit: 1,
    });

    expect(slots[0].startsAt.toISOString()).toBe("2026-06-22T07:00:00.000Z");
  });

  it("devuelve vacío si no hay horarios configurados", () => {
    const slots = findAvailableSlots({
      hours: [],
      busy: [],
      durationMinutes: 60,
      from: mondayMorning,
      limit: 5,
    });

    expect(slots).toHaveLength(0);
  });

  it("respeta el límite pedido", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 30,
      from: mondayMorning,
      limit: 2,
    });

    expect(slots).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

Expected: **22 tests en verde** (2 RLS + 7 fechas + 6 prompt + 7 disponibilidad).

Si algún test de disponibilidad falla, el fallo está casi seguro en `lib/agent/availability.ts` o en `zonedInstant`, no en el test: los valores esperados están calculados a mano para Madrid en junio (UTC+2). Si tras revisarlo crees de verdad que un valor esperado está mal, **párate y repórtalo** con tu razonamiento en vez de editarlo.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Añade el cálculo de huecos disponibles del agente"
```

---

### Task 3: Herramientas del agente

**Files:**
- Create: `lib/agent/tools.ts`
- Modify: `lib/dates.ts`

- [ ] **Step 1: Añadir un formateador de fecha y hora completa**

Al final de `lib/dates.ts`:

```ts
/** Formatea un instante como fecha y hora legibles en Madrid. */
export function formatDateTime(instant: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}
```

- [ ] **Step 2: Definir las herramientas y su ejecución**

`lib/agent/tools.ts`:

```ts
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
```

- [ ] **Step 3: Crear el cliente de servicio de Supabase**

El agente corre en un webhook, sin sesión de usuario, así que necesita `service_role`.

`lib/supabase/service.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service_role: se salta RLS. Úsalo SOLO en código de servidor sin
 * sesión de usuario (webhook de WhatsApp, agente). Nunca en un componente que
 * pueda llegar al navegador.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

Añádelo a la lista de Files creados de este task.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

Expected: sin errores, 22 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Añade las herramientas del agente y el cliente de servicio de Supabase"
```

---

### Task 4: Bucle del agente

**Files:**
- Create: `lib/agent/run.ts`

- [ ] **Step 1: Escribir el bucle**

`lib/agent/run.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";
import {
  AGENT_EFFORT,
  AGENT_MAX_TOKENS,
  AGENT_MODEL,
  getAnthropic,
} from "@/lib/agent/client";
import { AGENT_TOOLS, runTool, type ToolContext } from "@/lib/agent/tools";

/** Tope de vueltas del bucle para que un webhook no se quede colgado. */
const MAX_ITERATIONS = 6;

export type AgentReply = {
  text: string;
  handoff: boolean;
};

export async function runAgent({
  systemPrompt,
  messages,
  context,
}: {
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  context: ToolContext;
}): Promise<AgentReply> {
  const client = getAnthropic();
  const history: Anthropic.MessageParam[] = [...messages];
  let handoff = false;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: AGENT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: AGENT_EFFORT },
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: AGENT_TOOLS,
      messages: history,
    });

    if (response.stop_reason === "refusal") {
      return {
        text: "Prefiero que este tema lo vea una persona del equipo. Te paso con alguien.",
        handoff: true,
      };
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUses.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      return { text, handoff };
    }

    history.push({ role: "assistant", content: response.content });

    // Todos los resultados van en un único mensaje de usuario: separarlos
    // enseña al modelo a dejar de pedir herramientas en paralelo.
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      try {
        const outcome = await runTool(toolUse.name, toolUse.input, context);
        if (outcome.handoff) handoff = true;
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: outcome.content,
        });
      } catch {
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "La herramienta falló. Discúlpate y ofrece continuar más tarde.",
          is_error: true,
        });
      }
    }

    history.push({ role: "user", content: results });
  }

  return {
    text: "Disculpa, me he liado. Te paso con una persona del equipo.",
    handoff: true,
  };
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build
```

Expected: sin errores. (Aún no hay forma de ejecutarlo; se prueba en el Task 5.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Añade el bucle de ejecución del agente"
```

---

### Task 5: Pantalla "Probar agente"

Chat de prueba aislado: sin WhatsApp, sin escribir citas reales. Es lo que permite validar el agente antes de tener credenciales de Meta.

**Files:**
- Create: `app/(dashboard)/personalizacion/probar/page.tsx`, `app/(dashboard)/personalizacion/probar/actions.ts`
- Modify: `app/(dashboard)/personalizacion/page.tsx`

- [ ] **Step 1: Crear la Server Action**

`app/(dashboard)/personalizacion/probar/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import {
  getActiveBusiness,
  getBusinessHours,
  getMessageTemplates,
  getServices,
} from "@/lib/business";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { runAgent } from "@/lib/agent/run";
import type Anthropic from "@anthropic-ai/sdk";

const MAX_TURNS = 20;

type Turn = { role: "user" | "assistant"; text: string };

function parseHistory(raw: string): Turn[] {
  try {
    const parsed = JSON.parse(raw) as Turn[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_TURNS) : [];
  } catch {
    return [];
  }
}

export async function sendTestMessage(formData: FormData) {
  const message = String(formData.get("message") ?? "").trim();
  const history = parseHistory(String(formData.get("history") ?? "[]"));

  if (!message) {
    redirect(
      `/personalizacion/probar?h=${encodeURIComponent(JSON.stringify(history))}`
    );
  }

  const [business, hours, services, templates] = await Promise.all([
    getActiveBusiness(),
    getBusinessHours(),
    getServices(),
    getMessageTemplates(),
  ]);

  const now = new Date();

  const turns: Turn[] = [...history, { role: "user", text: message }];

  const messages: Anthropic.MessageParam[] = turns.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  let replyText: string;

  try {
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
        conversationId: null,
        contactPhone: null,
        hours,
        services,
        dryRun: true,
        now,
      },
    });
    replyText = reply.text || "(sin respuesta)";
  } catch (error) {
    replyText = `[error al llamar al agente: ${
      error instanceof Error ? error.message : "desconocido"
    }]`;
  }

  const next: Turn[] = [...turns, { role: "assistant", text: replyText }].slice(
    -MAX_TURNS
  );

  redirect(
    `/personalizacion/probar?h=${encodeURIComponent(JSON.stringify(next))}`
  );
}
```

- [ ] **Step 2: Crear la página**

`app/(dashboard)/personalizacion/probar/page.tsx`:

```tsx
import Link from "next/link";
import { sendTestMessage } from "./actions";

type Turn = { role: "user" | "assistant"; text: string };

function parseHistory(raw: string | undefined): Turn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Turn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async function ProbarAgentePage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const params = await searchParams;
  const history = parseHistory(params.h);

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-2xl">Probar agente</h1>
          <p className="text-tinta-suave">
            Conversación de prueba. No se envía nada por WhatsApp ni se guardan
            citas reales.
          </p>
        </div>
        <Link href="/personalizacion" className="text-sm hover:underline">
          ← Volver
        </Link>
      </div>

      <div className="flex max-w-2xl flex-col gap-3">
        {history.length === 0 && (
          <p className="text-tinta-suave">
            Escribe un mensaje como si fueras un cliente.
          </p>
        )}

        {history.map((turn, index) => (
          <div
            key={index}
            className={
              turn.role === "user"
                ? "mr-auto max-w-[80%] rounded bg-hueso-hondo px-4 py-2"
                : "ml-auto max-w-[80%] rounded bg-oliva px-4 py-2 text-hueso"
            }
          >
            <p className="mb-1 text-xs opacity-70">
              {turn.role === "user" ? "Cliente" : "Agente IA"}
            </p>
            <p className="whitespace-pre-wrap">{turn.text}</p>
          </div>
        ))}

        <form action={sendTestMessage} className="mt-4 flex items-end gap-2">
          <input
            type="hidden"
            name="history"
            value={JSON.stringify(history)}
          />
          <textarea
            name="message"
            rows={2}
            required
            maxLength={1000}
            placeholder="Escribe como cliente…"
            className="flex-1 border border-tinta bg-hueso px-3 py-2"
          />
          <button type="submit" className="bg-tinta px-4 py-2 text-hueso">
            Enviar
          </button>
        </form>

        {history.length > 0 && (
          <Link
            href="/personalizacion/probar"
            className="self-start text-sm text-bermellon hover:underline"
          >
            Empezar de cero
          </Link>
        )}
      </div>
    </>
  );
}
```

Nota: el historial viaja por la URL en vez de guardarse. Es una conversación de usar y tirar, y así la pantalla no ensucia la base de datos.

- [ ] **Step 3: Añadir el enlace desde Personalización**

En `app/(dashboard)/personalizacion/page.tsx`, añade `import Link from "next/link";` arriba y sustituye el bloque del encabezado (`<h1>` y el `<p>` que le sigue) por:

```tsx
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-2xl">Personalización</h1>
          <p className="text-tinta-suave">
            Configura cómo se comporta tu agente y qué sabe de tu negocio.
          </p>
        </div>
        <Link
          href="/personalizacion/probar"
          className="border border-tinta px-4 py-2 text-sm"
        >
          Probar agente
        </Link>
      </div>
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Verificar con evidencia real**

Necesitas `ANTHROPIC_API_KEY` en `.env.local`.

Antes de nada, deja el negocio de prueba con datos coherentes desde Personalización: al menos **un servicio** y **horarios en varios días**.

En `/personalizacion/probar`:

1. Escribe "Hola, quería pedir cita para una limpieza" → el agente debe responder en el tono configurado y **consultar disponibilidad** antes de proponer horas
2. Confirma que **las horas que propone caen dentro del horario configurado** y en días abiertos — compáralas con lo que hay en Personalización → Horarios
3. Acepta una hora → el agente debe pedir el nombre y luego confirmar. Como es modo prueba, la respuesta de la herramienta incluye "[modo prueba]"
4. **Verifica en base de datos que NO se ha creado ninguna cita** (`appointments` sigue como estaba). Esta es la propiedad central de esta pantalla
5. Escribe "quiero hablar con una persona" en una conversación nueva → el agente debe usar la herramienta de traspaso y despedirse
6. Cambia el **tono** en Personalización → General a "directo", vuelve a probar y confirma que el estilo de las respuestas cambia
7. Prueba "Empezar de cero" y confirma que el historial se vacía

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade la pantalla de prueba del agente"
```

---

### Task 6: Cifrado de credenciales y configuración de WhatsApp

**Files:**
- Create: `lib/crypto.ts`, `tests/crypto.test.ts`, `scripts/set-whatsapp-credentials.mjs`
- Modify: `.env.local.example`, `package.json`

- [ ] **Step 1: Escribir el módulo de cifrado**

`lib/crypto.ts`:

```ts
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function key(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET;

  if (!secret) {
    throw new Error("Falta CREDENTIALS_SECRET");
  }

  // Se deriva una clave de 32 bytes, así el secreto puede tener cualquier largo.
  return crypto.createHash("sha256").update(secret).digest();
}

/** Cifra un texto. Devuelve "iv.tag.ciphertext" en base64url. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/** Descifra lo producido por `encryptSecret`. Lanza si el texto fue manipulado. */
export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");

  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Credencial con formato inválido");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 2: Escribir los tests**

`tests/crypto.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

beforeAll(() => {
  process.env.CREDENTIALS_SECRET = "secreto-de-pruebas";
});

describe("cifrado de credenciales", () => {
  it("descifra lo que cifró", () => {
    const original = "EAAG...token-de-meta";
    expect(decryptSecret(encryptSecret(original))).toBe(original);
  });

  it("produce un texto distinto cada vez (IV aleatorio)", () => {
    expect(encryptSecret("mismo")).not.toBe(encryptSecret("mismo"));
  });

  it("no deja el texto original a la vista", () => {
    expect(encryptSecret("token-secreto")).not.toContain("token-secreto");
  });

  it("rechaza un texto manipulado", () => {
    const payload = encryptSecret("token");
    const [iv, tag, data] = payload.split(".");
    const tampered = [iv, tag, data.slice(0, -2) + "AA"].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rechaza un formato inválido", () => {
    expect(() => decryptSecret("basura")).toThrow("formato inválido");
  });
});
```

- [ ] **Step 3: Script para cargar las credenciales**

`scripts/set-whatsapp-credentials.mjs`:

```js
// Guarda las credenciales de WhatsApp Cloud API de un negocio, cifrando el
// token de acceso.
//
//   node scripts/set-whatsapp-credentials.mjs <business_id> <phone_number_id> <access_token>

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import crypto from "node:crypto";

config({ path: ".env.local" });

const [businessId, phoneNumberId, accessToken] = process.argv.slice(2);

if (!businessId || !phoneNumberId || !accessToken) {
  console.error(
    "Uso: node scripts/set-whatsapp-credentials.mjs <business_id> <phone_number_id> <access_token>"
  );
  process.exit(1);
}

if (!process.env.CREDENTIALS_SECRET) {
  console.error("Falta CREDENTIALS_SECRET en .env.local");
  process.exit(1);
}

function encryptSecret(plain) {
  const key = crypto
    .createHash("sha256")
    .update(process.env.CREDENTIALS_SECRET)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { error } = await admin
  .from("businesses")
  .update({
    whatsapp_phone_number_id: phoneNumberId,
    whatsapp_access_token: encryptSecret(accessToken),
    whatsapp_connected: true,
  })
  .eq("id", businessId);

if (error) {
  console.error("Error:", error.message);
  process.exit(1);
}

console.log("Credenciales de WhatsApp guardadas para", businessId);
console.log("El token se ha guardado cifrado.");
```

- [ ] **Step 4: Añadir el script y las variables**

En `package.json`, junto a `seed`:

```json
"whatsapp:creds": "node scripts/set-whatsapp-credentials.mjs"
```

En `.env.local.example`, añade:

```bash
CREDENTIALS_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
```

- [ ] **Step 5: Verificar**

Genera un secreto y añádelo a `.env.local`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Luego:

```bash
npx tsc --noEmit && npm run build && npm run test
```

Expected: **27 tests en verde** (22 anteriores + 5 de cifrado).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade cifrado de credenciales y carga de las de WhatsApp"
```

---

### Task 7: Webhook de WhatsApp

**Files:**
- Create: `app/api/whatsapp/webhook/route.ts`, `lib/agent/inbound.ts`

- [ ] **Step 1: Escribir el procesador de mensajes entrantes**

`lib/agent/inbound.ts`:

```ts
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
```

Nota: `messages` empieza siempre con un turno de usuario porque el primer mensaje de una conversación nueva siempre es del cliente. Si un traspaso deja la última entrada como `assistant`, la API lo acepta igualmente (turnos consecutivos del mismo rol se combinan).

- [ ] **Step 2: Escribir el Route Handler**

`app/api/whatsapp/webhook/route.ts`:

```ts
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { handleInboundMessage } from "@/lib/agent/inbound";

// El agente puede tardar varios segundos entre llamadas a Claude y consultas.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

function signatureIsValid(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;

  if (!secret || !header?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const received = header.slice("sha256=".length);

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex")
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!signatureIsValid(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      for (const message of value?.messages ?? []) {
        if (!phoneNumberId || !message?.from) continue;

        const contactName =
          value?.contacts?.find((c: any) => c?.wa_id === message.from)?.profile
            ?.name ?? null;

        const text =
          message.type === "text"
            ? message.text?.body
            : "[el cliente ha enviado un mensaje que no es de texto]";

        if (!text) continue;

        try {
          await handleInboundMessage({
            phoneNumberId,
            fromPhone: message.from,
            contactName,
            text,
          });
        } catch (error) {
          // Meta reintenta si no devolvemos 200, y reintentar una y otra vez
          // duplicaría mensajes. Se registra y se sigue.
          console.error("Error procesando mensaje entrante:", error);
        }
      }
    }
  }

  return new NextResponse("OK", { status: 200 });
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

El build fallará hasta que exista `lib/whatsapp/send.ts` (Task 8). Créalo ahora como un archivo mínimo que se completa en el Task 8:

`lib/whatsapp/send.ts`:

```ts
export async function sendWhatsAppMessage(_params: {
  businessId: string;
  toPhone: string;
  text: string;
}): Promise<void> {
  throw new Error("Sin implementar hasta el Task 8");
}
```

- [ ] **Step 4: Verificar con evidencia real (sin Meta)**

El webhook se puede probar entero sin cuenta de Meta, firmando las peticiones tú mismo.

Con el servidor en el puerto 3005 y `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET` en `.env.local`:

1. **Verificación (GET):**
   ```bash
   curl -i "http://localhost:3005/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=12345"
   ```
   Expected: `200` con cuerpo `12345`. Con un token incorrecto: `403`.

2. **Firma inválida (POST):**
   ```bash
   curl -i -X POST http://localhost:3005/api/whatsapp/webhook -H "content-type: application/json" -d '{"entry":[]}'
   ```
   Expected: `401`.

3. **Mensaje entrante con firma válida:** escribe un script en `.scratch/` que construya el cuerpo, calcule el HMAC con `WHATSAPP_APP_SECRET` y haga el POST. Usa un `phone_number_id` que hayas asociado al negocio de prueba con `npm run whatsapp:creds` (puedes usar un token de acceso falso: el envío fallará en el Task 8, pero aquí solo importa la recepción).

   Cuerpo de ejemplo:
   ```json
   {"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"TU_PHONE_ID"},"contacts":[{"wa_id":"34600999888","profile":{"name":"Cliente Prueba"}}],"messages":[{"from":"34600999888","type":"text","text":{"body":"Hola, quiero cita para una limpieza"}}]}}]}]}
   ```

   Expected: `200`. Y en base de datos:
   - Una **conversación nueva** para ese teléfono, con el nombre del contacto
   - Un mensaje con `sender = 'cliente'` y ese texto
   - Un mensaje con `sender = 'agente_ia'` con la respuesta del agente
   - La conversación **visible en el panel** en `/conversaciones`

4. **Bot en pausa:** pon esa conversación en pausa desde el panel, vuelve a enviar un mensaje firmado y confirma que **se guarda el mensaje del cliente pero NO hay respuesta del agente**.

5. **Número desconocido:** envía con un `phone_number_id` que no corresponda a ningún negocio y confirma que devuelve `200` sin crear nada.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Añade el webhook de WhatsApp con verificación de firma"
```

---

### Task 8: Envío por WhatsApp

**Files:**
- Modify: `lib/whatsapp/send.ts`, `app/(dashboard)/conversaciones/actions.ts`

- [ ] **Step 1: Implementar el envío**

`lib/whatsapp/send.ts` (reemplaza el archivo mínimo del Task 7):

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/lib/crypto";

const GRAPH_VERSION = "v21.0";

/**
 * Envía un mensaje de texto por la WhatsApp Cloud API con las credenciales del
 * negocio. Lanza si el negocio no tiene WhatsApp conectado o si Meta rechaza
 * la petición.
 */
export async function sendWhatsAppMessage({
  businessId,
  toPhone,
  text,
}: {
  businessId: string;
  toPhone: string;
  text: string;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("businesses")
    .select("whatsapp_phone_number_id, whatsapp_access_token")
    .eq("id", businessId)
    .limit(1);

  if (error) throw error;

  const row = data?.[0];

  if (!row?.whatsapp_phone_number_id || !row?.whatsapp_access_token) {
    throw new Error("El negocio no tiene WhatsApp conectado");
  }

  const token = decryptSecret(row.whatsapp_access_token as string);

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${row.whatsapp_phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: text },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`WhatsApp rechazó el envío (${response.status}): ${detail}`);
  }
}
```

- [ ] **Step 2: Enviar también las respuestas humanas**

En `app/(dashboard)/conversaciones/actions.ts`, dentro de `sendHumanMessage`, sustituye el bloque del `TODO (Fase 4)` por el envío real. Necesitas el `business_id` y el teléfono de la conversación, que `getConversation` ya devuelve parcialmente — añade el import y el envío:

```ts
import { getActiveBusinessId } from "@/lib/business";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
```

y reemplaza el comentario `TODO (Fase 4)` por:

```ts
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
    } catch {
      revalidatePath("/conversaciones");
      fail(
        conversationId,
        "El mensaje se guardó, pero no se pudo enviar por WhatsApp."
      );
    }
  }
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit && npm run build && npm run test
```

Expected: 27 tests en verde.

- [ ] **Step 4: Verificar con evidencia real**

**Sin credenciales reales de Meta** (lo que se puede comprobar siempre):

1. Con un token de acceso falso cargado, responde como humano desde `/conversaciones` y confirma que: el mensaje **se guarda igualmente**, el bot se pausa, y aparece el aviso "El mensaje se guardó, pero no se pudo enviar por WhatsApp." Esta es la propiedad importante: **un fallo de Meta no debe perder el mensaje**.
2. Confirma en base de datos que el mensaje está, pese al fallo de envío.

**Con credenciales reales de Meta** (si el usuario las ha proporcionado):

3. Carga las credenciales reales con `npm run whatsapp:creds <business_id> <phone_number_id> <token>`
4. Escribe al número desde un WhatsApp real y confirma el ciclo completo: llega el mensaje, el agente responde **en WhatsApp**, y todo queda registrado en el panel
5. Responde como humano desde el panel y confirma que **llega al teléfono**

- [ ] **Step 5: Verificación final de la Fase 4**

- Recorre Dashboard → Conversaciones → Personalización → Probar agente sin errores
- Confirma que el modo prueba **sigue sin crear citas** y el webhook **sí las crea**
- Sin errores en la consola del navegador ni en el log del servidor
- `npm run test` → 27 tests en verde

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade el envío de mensajes por WhatsApp Cloud API"
```

---

## Self-review de este plan

- **Cobertura del spec (sección 5):** el flujo completo del webhook (Tasks 7-8), el prompt base con tono, servicios y horarios inyectados (Task 1), las tres herramientas `consultar_disponibilidad` / `agendar_cita` / `transferir_a_humano` (Task 3), el respeto a `bot_active` (Task 7), y la pantalla "Probar agente" con calendario simulado y sin efectos reales (Task 5). La creación del evento en Google Calendar queda marcada con un `TODO` en un único punto, para la Fase 5.
- **Placeholders:** ninguno — todos los pasos llevan código completo o comandos exactos con salida esperada.
- **Consistencia de tipos:** `ToolContext` y `ToolOutcome` se definen en `lib/agent/tools.ts` (Task 3) y los consume `runAgent` (Task 4), la pantalla de prueba (Task 5) y el webhook (Task 7). `buildSystemPrompt` (Task 1) recibe siempre `{business, hours, services, templates, nowIso}` en los tres puntos de llamada. `findAvailableSlots` (Task 2) se llama desde las dos herramientas de cita. `encryptSecret`/`decryptSecret` (Task 6) se usan en el script de carga y en el envío (Task 8). `createServiceClient` se crea en el Task 3 y lo usan los Tasks 3, 7 y 8. `sendWhatsAppMessage` se declara como stub en el Task 7 y se implementa en el Task 8, que es lo que permite compilar entre medias.
- **Orden deliberado:** el agente se construye y se valida entero (Tasks 1-5) **antes** de tocar Meta, para que la falta de credenciales no bloquee la fase. Solo los Tasks 7-8 necesitan WhatsApp, y aun así se verifican firmando peticiones a mano.
- **Riesgo conocido:** `findAvailableSlots` es la pieza con más lógica y la que la Fase 5 sustituirá por Google Calendar; por eso es una función pura con 7 tests y un único punto de llamada desde las herramientas.
