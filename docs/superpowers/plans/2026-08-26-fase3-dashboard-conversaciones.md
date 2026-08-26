# Panel de clientes — Fase 3: Dashboard y Conversaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño de un negocio vea de un vistazo la actividad reciente (Dashboard con 4 métricas y las últimas conversaciones) y pueda leer y participar en las conversaciones de WhatsApp desde el panel, pausando el bot cuando quiera responder él mismo.

**Architecture:** Dos pantallas nuevas sobre el layout existente. La conversación abierta se selecciona por query param (`?c=<id>`), igual que las pestañas de Personalización, para mantener todo en Server Components. El negocio activo pasa a resolverse por cookie, cerrando el hueco multi-negocio que dejó la Fase 1. El envío real por WhatsApp queda fuera: esta fase escribe el mensaje en la base de datos y deja la costura preparada para la Fase 4.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Tailwind CSS v4, Supabase (Postgres + RLS).

> **Restricción de Next.js vigente en todo el proyecto:** un archivo con `"use server"` **solo puede exportar funciones async**. Exportar una constante compila con `tsc` pero rompe `next build`. Las constantes compartidas van en archivos aparte sin `"use server"`.

> **Entorno de verificación:** **Supabase en la nube** (sin Docker). Para probar en navegador: puerto **3005** y **build de producción** (`npm run build && npx next start -p 3005`) — en `next dev` las Server Actions fallan con error `E394`. Usuario de prueba con negocio: `dev@jctech.local` / `DevPanel1234!` (negocio `caadda18-f2df-4728-8050-186222074a31`). El panel del navegador no compone frames: usa `javascript_tool` y `.click()` sobre botones reales (`requestSubmit()` sin submitter no dispara la Server Action). Consultas a la base: script Node temporal en `.scratch/` con `@supabase/supabase-js` y la service_role key de `.env.local`; borra `.scratch` al terminar.

**Ver también:**
- Spec: `docs/superpowers/specs/2026-08-18-panel-clientes-design.md` (sección 4: Dashboard y Conversaciones)
- Fase 1: `docs/superpowers/plans/2026-08-18-fase1-fundamentos.md`
- Fase 2: `docs/superpowers/plans/2026-08-21-fase2-personalizacion.md`

---

## Contexto heredado

Ya existe y está verificado:

- **Esquema**: `conversations` (`business_id`, `contact_name`, `contact_phone`, `bot_active` bool default true, `last_message_at`, único por `(business_id, contact_phone)`), `messages` (`conversation_id`, `sender` enum `cliente`/`agente_ia`/`humano`, `content`, `created_at`, índice en `(conversation_id, created_at)`), `appointments` (`business_id`, `starts_at`, `ends_at`, `status` enum `confirmada`/`cancelada`/`completada`, `contact_name`, `service_id`, `conversation_id`).
- **RLS y GRANTs**: políticas `for all` vía `is_business_member(business_id)`; `messages` usa subconsulta a través de `conversations`. CRUD completo concedido a `authenticated`.
- **Helpers** en `lib/business.ts`: `getUserBusinesses`, `getActiveBusiness`, `getBusinessHours`, `getServices`, `getMessageTemplates`, más los tipos `Business`, `BusinessHour`, `Service` y la constante `MESSAGE_TEMPLATES`.
- **Convenciones**: Server Actions con `"use server"`, validación en servidor antes de tocar la red, constantes con nombre para los límites, mensajes de error genéricos por query param `?error=`, `revalidatePath` tras escribir, y `redirect()` sin `return` explícito.

## Fuera de alcance (a propósito)

- **Envío real por WhatsApp**: la acción de responder como humano guarda el mensaje en la base y nada más. La llamada a la Cloud API se añade en la Fase 4, en un único punto marcado con un comentario.
- **Datos de citas reales**: `appointments` se rellena desde Google Calendar en la Fase 5. Aquí las tarjetas leen la tabla, que estará casi vacía salvo por los datos de prueba.
- **Tiempo real**: la lista de conversaciones no se auto-refresca; se recarga al navegar. Suficiente para esta fase.

---

### Task 1: Negocio activo por cookie

Cierra un hueco real heredado de la Fase 1: `/select-business` enlaza a `/dashboard?business=<id>`, pero nadie lee ese parámetro, y `getActiveBusiness()` usa `.single()`, que **lanza error** si el usuario pertenece a más de un negocio.

**Files:**
- Create: `lib/active-business.ts`, `app/select-business/actions.ts`
- Modify: `lib/business.ts`, `app/select-business/page.tsx`, `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Crear el módulo de la cookie**

`lib/active-business.ts`:

```ts
import { cookies } from "next/headers";

export const ACTIVE_BUSINESS_COOKIE = "jctech_business";

export async function readActiveBusinessId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_BUSINESS_COOKIE)?.value ?? null;
}
```

- [ ] **Step 2: Hacer que `getActiveBusiness` respete la cookie**

En `lib/business.ts`, añade el import al principio del archivo:

```ts
import { readActiveBusinessId } from "@/lib/active-business";
```

y reemplaza el cuerpo de `getActiveBusiness()` por:

```ts
export async function getActiveBusiness(): Promise<Business> {
  const supabase = await createClient();
  const activeId = await readActiveBusinessId();

  let query = supabase
    .from("businesses")
    .select(
      "id, name, email, tone, base_prompt, address, description, ask_new_patient"
    );

  if (activeId) {
    query = query.eq("id", activeId);
  }

  // Sin cookie (o con una cookie obsoleta) se cae al primer negocio del
  // usuario. RLS ya limita el conjunto a los negocios de los que es miembro.
  const { data, error } = await query.order("created_at").limit(1);

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Sin negocio activo");

  return data[0] as Business;
}
```

Nota: se sustituye `.single()` (que falla con 0 o 2+ filas) por `.limit(1)` más comprobación explícita, de modo que un usuario con varios negocios ya no rompe la página.

- [ ] **Step 3: Crear la Server Action que fija la cookie**

`app/select-business/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/active-business";
import { getUserBusinesses } from "@/lib/business";

export async function selectBusiness(formData: FormData) {
  const businessId = String(formData.get("business_id") ?? "");

  // Solo se acepta un negocio del que el usuario sea miembro: la cookie no
  // debe poder apuntar a un negocio ajeno.
  const memberships = await getUserBusinesses();
  const allowed = memberships.some((m) => m.business_id === businessId);

  if (!allowed) {
    redirect("/select-business");
  }

  const store = await cookies();
  store.set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
```

- [ ] **Step 4: Cambiar el selector de enlaces a formularios**

`app/select-business/page.tsx`:

```tsx
import { getUserBusinesses } from "@/lib/business";
import { selectBusiness } from "./actions";

export default async function SelectBusinessPage() {
  const businesses = await getUserBusinesses();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl">Elige un negocio</h1>
      {businesses.map((b) => (
        <form key={b.business_id} action={selectBusiness}>
          <input type="hidden" name="business_id" value={b.business_id} />
          <button
            type="submit"
            className="w-full border border-tinta px-4 py-3 text-left hover:bg-hueso-hondo"
          >
            {b.businesses.name}
          </button>
        </form>
      ))}
    </main>
  );
}
```

- [ ] **Step 5: Que el layout respete la cookie**

En `app/(dashboard)/layout.tsx`, añade el import:

```tsx
import { readActiveBusinessId } from "@/lib/active-business";
```

y reemplaza el bloque que va desde `if (businesses.length > 1)` hasta `const business = businesses[0].businesses;` por:

```tsx
  const activeId = await readActiveBusinessId();
  const membership =
    businesses.find((m) => m.business_id === activeId) ??
    (businesses.length === 1 ? businesses[0] : null);

  if (!membership) {
    redirect("/select-business");
  }

  const business = membership.businesses;
```

Con esto: un usuario con un solo negocio entra directo; uno con varios y cookie válida entra al negocio elegido; uno con varios y sin cookie va al selector.

- [ ] **Step 6: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Verificar con evidencia real**

1. Con el usuario de prueba (un solo negocio): entra en `/dashboard` y confirma que sigue funcionando igual, sin pasar por el selector.
2. Crea un **segundo negocio** para ese mismo usuario llamando al RPC `create_business` desde un script (`.scratch/`) con una sesión del usuario de prueba.
3. Recarga `/dashboard`: debe redirigir a `/select-business` y mostrar **los dos negocios**.
4. Elige el segundo: debe llevarte a `/dashboard` con **el nombre del segundo negocio en el sidebar**. Antes de este task, este flujo lanzaba un error de `.single()`.
5. Entra en `/personalizacion?tab=negocio` y confirma que muestra los datos del negocio elegido, no del otro.
6. Confirma que la cookie no acepta un negocio ajeno: envía la acción con un `business_id` inventado (por JavaScript) y comprueba que vuelve a `/select-business` sin fijar la cookie.
7. Limpieza: borra el segundo negocio para dejar el entorno como estaba (`delete from businesses where id = ...` vía service_role), y borra la cookie del navegador.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Resuelve el negocio activo por cookie y arregla el caso multi-negocio"
```

---

### Task 2: Utilidades de fecha con zona horaria

Las tarjetas "Citas hoy" y "Citas esta semana" necesitan límites de día correctos. El servidor corre en UTC (Vercel), pero el negocio vive en España: a las 00:30 de Madrid, UTC todavía marca el día anterior.

**Files:**
- Create: `lib/dates.ts`

- [ ] **Step 1: Escribir el módulo**

`lib/dates.ts`:

```ts
export const TIME_ZONE = "Europe/Madrid";

const PART_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

function partsIn(instant: Date): Parts {
  const raw = Object.fromEntries(
    PART_FORMATTER.formatToParts(instant).map((p) => [p.type, p.value])
  );

  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    // Intl puede devolver "24" para medianoche; se normaliza a 0.
    hour: Number(raw.hour) % 24,
    minute: Number(raw.minute),
    weekday: raw.weekday,
  };
}

// Desplazamiento de la zona respecto a UTC, en minutos, para un instante dado.
function offsetMinutes(instant: Date): number {
  const p = partsIn(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return (asIfUtc - instant.getTime()) / 60000;
}

// Instante UTC correspondiente a las 00:00 en Madrid del día indicado.
function zonedMidnight(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = offsetMinutes(guess);
  const adjusted = new Date(guess.getTime() - offset * 60000);
  // Segunda pasada: cubre los días de cambio de hora, en los que el
  // desplazamiento del instante ajustado difiere del de la estimación.
  const secondOffset = offsetMinutes(adjusted);
  return secondOffset === offset
    ? adjusted
    : new Date(guess.getTime() - secondOffset * 60000);
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Inicio y fin (exclusivo) del día actual en Madrid, como instantes UTC. */
export function todayRange(now: Date = new Date()): { from: Date; to: Date } {
  const p = partsIn(now);
  const from = zonedMidnight(p.year, p.month, p.day);
  const to = zonedMidnight(p.year, p.month, p.day + 1);
  return { from, to };
}

/** Inicio (lunes) y fin (exclusivo) de la semana actual en Madrid. */
export function weekRange(now: Date = new Date()): { from: Date; to: Date } {
  const p = partsIn(now);
  const dayIndex = WEEKDAY_INDEX[p.weekday] ?? 0;
  const from = zonedMidnight(p.year, p.month, p.day - dayIndex);
  const to = zonedMidnight(p.year, p.month, p.day - dayIndex + 7);
  return { from, to };
}

/** Instante de hace `days` días, para ventanas móviles tipo "últimos 30 días". */
export function daysAgo(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Formatea una fecha ISO como hora local de Madrid (HH:MM). */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Formatea una fecha ISO como fecha corta de Madrid (p. ej. "27 may"). */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}
```

Nota: `Date.UTC` normaliza los desbordes, así que `day + 1` en el día 31 o `day - dayIndex` en negativo funcionan sin aritmética extra.

- [ ] **Step 2: Escribir los tests**

`tests/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { todayRange, weekRange, daysAgo } from "@/lib/dates";

describe("todayRange", () => {
  it("usa el día de Madrid, no el de UTC, justo después de medianoche", () => {
    // 2026-06-15T22:30:00Z son las 00:30 del 16 de junio en Madrid (UTC+2).
    const { from, to } = todayRange(new Date("2026-06-15T22:30:00Z"));
    expect(from.toISOString()).toBe("2026-06-15T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-06-16T22:00:00.000Z");
  });

  it("aplica el desplazamiento de invierno (UTC+1)", () => {
    const { from, to } = todayRange(new Date("2026-01-15T12:00:00Z"));
    expect(from.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("cubre exactamente 24 horas en un día normal", () => {
    const { from, to } = todayRange(new Date("2026-06-15T12:00:00Z"));
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("weekRange", () => {
  it("empieza el lunes", () => {
    // 2026-06-17 es miércoles.
    const { from, to } = weekRange(new Date("2026-06-17T12:00:00Z"));
    // Lunes 15 de junio a las 00:00 en Madrid = 14 de junio 22:00 UTC.
    expect(from.toISOString()).toBe("2026-06-14T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-06-21T22:00:00.000Z");
  });

  it("trata el domingo como último día de la semana, no como el primero", () => {
    // 2026-06-21 es domingo: la semana debe seguir empezando el lunes 15.
    const { from } = weekRange(new Date("2026-06-21T12:00:00Z"));
    expect(from.toISOString()).toBe("2026-06-14T22:00:00.000Z");
  });

  it("cruza el cambio de mes sin romperse", () => {
    // 2026-07-01 es miércoles: la semana empieza el lunes 29 de junio.
    const { from } = weekRange(new Date("2026-07-01T12:00:00Z"));
    expect(from.toISOString()).toBe("2026-06-28T22:00:00.000Z");
  });
});

describe("daysAgo", () => {
  it("resta días naturales", () => {
    const result = daysAgo(30, new Date("2026-06-15T12:00:00Z"));
    expect(result.toISOString()).toBe("2026-05-16T12:00:00.000Z");
  });
});
```

- [ ] **Step 3: Habilitar el alias `@/` en Vitest**

Los tests importan `@/lib/dates`. `vitest.config.ts` no resuelve ese alias todavía; reemplázalo por:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Ejecutar los tests**

```bash
npm run test
```

Expected: 2 tests de RLS (ya existentes) + 8 tests nuevos de fechas, todos en verde. Si alguno de fechas falla, el fallo está en `lib/dates.ts`, no en el test: los valores esperados están calculados a mano para Europe/Madrid (UTC+2 en verano, UTC+1 en invierno).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Añade utilidades de fecha con zona horaria de Madrid"
```

---

### Task 3: Lectores de conversaciones, mensajes y métricas

**Files:**
- Create: `lib/conversations.ts`, `lib/metrics.ts`

- [ ] **Step 1: Crear el lector de conversaciones**

`lib/conversations.ts`:

```ts
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
```

**Importante — por qué se filtra explícitamente por `business_id`:** RLS limita las filas a los negocios de los que el usuario **es miembro**, que no es lo mismo que el negocio **activo**. Un usuario con dos negocios vería datos mezclados si solo se confiara en RLS. Esta lección salió de un bug real detectado al verificar el Task 1, donde la pestaña de Servicios mostraba los servicios del otro negocio. Todas las lecturas nuevas deben filtrar por el negocio activo, además de apoyarse en RLS.

Nota: `getConversations(5)` sustituye a la función `getRecentConversations` que aparecía en versiones previas de este plan; el Dashboard la llama con el límite y la pantalla de Conversaciones sin él.

- [ ] **Step 2: Crear el lector de métricas**

`lib/metrics.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";
import { daysAgo, todayRange, weekRange } from "@/lib/dates";

export type DashboardMetrics = {
  conversations30d: number;
  appointmentsThisWeek: number;
  appointmentsToday: number;
  pausedBots: number;
};

const EMPTY_METRICS: DashboardMetrics = {
  conversations30d: 0,
  appointmentsThisWeek: 0,
  appointmentsToday: 0,
  pausedBots: 0,
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return EMPTY_METRICS;

  const supabase = await createClient();
  const today = todayRange();
  const week = weekRange();

  const [conversations30d, appointmentsThisWeek, appointmentsToday, pausedBots] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("last_message_at", daysAgo(30).toISOString()),
      supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .neq("status", "cancelada")
        .gte("starts_at", week.from.toISOString())
        .lt("starts_at", week.to.toISOString()),
      supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .neq("status", "cancelada")
        .gte("starts_at", today.from.toISOString())
        .lt("starts_at", today.to.toISOString()),
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("bot_active", false),
    ]);

  for (const result of [
    conversations30d,
    appointmentsThisWeek,
    appointmentsToday,
    pausedBots,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    conversations30d: conversations30d.count ?? 0,
    appointmentsThisWeek: appointmentsThisWeek.count ?? 0,
    appointmentsToday: appointmentsToday.count ?? 0,
    pausedBots: pausedBots.count ?? 0,
  };
}
```

Nota: las citas canceladas no cuentan en las tarjetas. Las 4 consultas usan `head: true` (solo recuento, sin traer filas) y van en paralelo.

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade lectores de conversaciones y métricas del dashboard"
```

---

### Task 4: Script de datos de prueba

Las pantallas no se pueden verificar contra tablas vacías, y `conversations`/`messages`/`appointments` no se rellenan de verdad hasta las Fases 4 y 5.

**Files:**
- Create: `scripts/seed-demo.mjs`
- Modify: `package.json`

- [ ] **Step 1: Escribir el script**

`scripts/seed-demo.mjs`:

```js
// Rellena el negocio de desarrollo con conversaciones, mensajes y citas de
// ejemplo para poder ver y verificar el panel. Idempotente: borra los datos de
// demo anteriores del mismo negocio antes de insertar.
//
//   node scripts/seed-demo.mjs <business_id>

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const businessId = process.argv[2];

if (!businessId) {
  console.error("Uso: node scripts/seed-demo.mjs <business_id>");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600_000).toISOString();
const hoursAhead = (h) => new Date(now + h * 3600_000).toISOString();

// Limpieza previa: borrar las conversaciones arrastra sus mensajes en cascada.
await admin.from("appointments").delete().eq("business_id", businessId);
await admin.from("conversations").delete().eq("business_id", businessId);

const conversations = [
  {
    contact_name: "Lucía Fernández",
    contact_phone: "+34600111222",
    bot_active: true,
    last_message_at: hoursAgo(1),
    messages: [
      ["cliente", "Hola, quería pedir cita para una limpieza", 3],
      ["agente_ia", "¡Hola Lucía! Claro. ¿Te viene bien el miércoles a las 15:00?", 2.9],
      ["cliente", "Sí, perfecto", 1.1],
      ["agente_ia", "Cita confirmada para el miércoles a las 15:00. ¡Hasta pronto!", 1],
    ],
  },
  {
    contact_name: "Marcos Ruiz",
    contact_phone: "+34600333444",
    bot_active: false,
    last_message_at: hoursAgo(5),
    messages: [
      ["cliente", "Buenas, ¿cuánto cuesta un empaste?", 7],
      ["agente_ia", "Depende del caso. ¿Quieres que te pase con alguien del equipo?", 6.5],
      ["cliente", "Sí, mejor", 6],
      ["humano", "Hola Marcos, soy Javier. El empaste ronda los 60 €.", 5],
    ],
  },
  {
    contact_name: null,
    contact_phone: "+34600555666",
    bot_active: true,
    last_message_at: hoursAgo(50),
    messages: [
      ["cliente", "¿A qué hora abrís los sábados?", 50],
      ["agente_ia", "Los sábados abrimos de 10:00 a 13:00.", 50],
    ],
  },
];

for (const conversation of conversations) {
  const { messages, ...row } = conversation;

  const { data: inserted, error } = await admin
    .from("conversations")
    .insert({ ...row, business_id: businessId })
    .select("id")
    .single();

  if (error) {
    console.error("conversación:", error.message);
    process.exit(1);
  }

  const { error: messagesError } = await admin.from("messages").insert(
    messages.map(([sender, content, ago]) => ({
      conversation_id: inserted.id,
      sender,
      content,
      created_at: hoursAgo(ago),
    }))
  );

  if (messagesError) {
    console.error("mensajes:", messagesError.message);
    process.exit(1);
  }
}

const { error: appointmentsError } = await admin.from("appointments").insert([
  {
    business_id: businessId,
    contact_name: "Lucía Fernández",
    contact_phone: "+34600111222",
    starts_at: hoursAhead(3),
    ends_at: hoursAhead(4),
    status: "confirmada",
  },
  {
    business_id: businessId,
    contact_name: "Marcos Ruiz",
    contact_phone: "+34600333444",
    starts_at: hoursAhead(30),
    ends_at: hoursAhead(31),
    status: "confirmada",
  },
  {
    business_id: businessId,
    contact_name: "Cita cancelada",
    contact_phone: "+34600777888",
    starts_at: hoursAhead(5),
    ends_at: hoursAhead(6),
    status: "cancelada",
  },
]);

if (appointmentsError) {
  console.error("citas:", appointmentsError.message);
  process.exit(1);
}

console.log("Datos de demo creados para el negocio", businessId);
console.log("- 3 conversaciones (1 con el bot en pausa)");
console.log("- 10 mensajes");
console.log("- 3 citas (1 cancelada, que no debe contar en las tarjetas)");
```

- [ ] **Step 2: Añadir el script a `package.json`**

En la sección `"scripts"`, junto a `test`:

```json
"seed": "node scripts/seed-demo.mjs"
```

- [ ] **Step 3: Ejecutarlo y verificar**

```bash
npm run seed caadda18-f2df-4728-8050-186222074a31
```

Expected: imprime el resumen sin errores. Consulta la base y confirma: 3 conversaciones (una con `bot_active = false`), 10 mensajes, 3 citas (una `cancelada`).

Ejecútalo **dos veces seguidas** y confirma que sigue habiendo 3 conversaciones y no 6 — debe ser idempotente.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade script de datos de demo para el panel"
```

---

### Task 5: Página Dashboard

**Files:**
- Create: `app/(dashboard)/dashboard/metric-card.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Crear la tarjeta de métrica**

`app/(dashboard)/dashboard/metric-card.tsx`:

```tsx
export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="border border-tinta/20 px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{label}</p>
      <p className="cifra my-1 text-4xl">{value}</p>
      <p className="text-sm text-tinta-suave">{hint}</p>
    </div>
  );
}
```

Nota: la clase `cifra` ya existe en `globals.css` y aplica la tipografía Fraunces, la misma de los títulos.

- [ ] **Step 2: Escribir la página**

`app/(dashboard)/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { getDashboardMetrics } from "@/lib/metrics";
import { getConversations } from "@/lib/conversations";
import { formatShortDate, formatTime } from "@/lib/dates";
import { MetricCard } from "./metric-card";

export default async function DashboardPage() {
  const [metrics, conversations] = await Promise.all([
    getDashboardMetrics(),
    getConversations(5),
  ]);

  return (
    <>
      <h1 className="mb-1 text-2xl">Dashboard</h1>
      <p className="mb-6 text-tinta-suave">
        Resumen de actividad reciente de tu negocio.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Conversaciones 30D"
          value={metrics.conversations30d}
          hint="Últimos 30 días"
        />
        <MetricCard
          label="Citas esta semana"
          value={metrics.appointmentsThisWeek}
          hint="Lunes a domingo"
        />
        <MetricCard
          label="Citas hoy"
          value={metrics.appointmentsToday}
          hint="Confirmadas para hoy"
        />
        <MetricCard
          label="Bot en pausa"
          value={metrics.pausedBots}
          hint="Conversaciones con atención humana"
        />
      </div>

      <div className="border border-tinta/20">
        <div className="flex items-center justify-between border-b border-tinta/20 px-5 py-3">
          <h2 className="text-lg">Últimas conversaciones</h2>
          <Link href="/conversaciones" className="text-sm hover:underline">
            Ver todas →
          </Link>
        </div>

        {conversations.length === 0 && (
          <p className="px-5 py-6 text-tinta-suave">
            Todavía no hay conversaciones.
          </p>
        )}

        {conversations.map((conversation) => (
          <Link
            key={conversation.id}
            href={`/conversaciones?c=${conversation.id}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-hueso-hondo"
          >
            <span>{conversation.contact_name ?? conversation.contact_phone}</span>
            <span className="text-sm text-tinta-suave">
              {formatShortDate(conversation.last_message_at)}{" "}
              {formatTime(conversation.last_message_at)}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Verificar con evidencia real**

Con los datos de demo del Task 4 cargados, entra en `/dashboard` y confirma:
- **Conversaciones 30D = 2** (la tercera conversación tiene su último mensaje hace 50 h, dentro de 30 días, así que en realidad son **3** — comprueba el número real contra la base y ajusta tu expectativa: lo importante es que el número del panel coincida con el recuento en base de datos)
- **Bot en pausa = 1** (Marcos Ruiz)
- **Citas hoy** y **Citas esta semana**: compara con el recuento real en base de datos, teniendo en cuenta que la cita cancelada **no** debe contar y que las citas de demo caen a +3 h y +30 h de ahora
- La lista muestra las 3 conversaciones ordenadas de más reciente a más antigua, con nombre (o teléfono cuando no hay nombre) y fecha/hora
- El enlace "Ver todas" lleva a `/conversaciones`
- Cada fila enlaza a `/conversaciones?c=<id>`

Verifica los 4 recuentos con una consulta directa a la base y confirma que coinciden con lo que muestra la página.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Añade la pantalla de Dashboard con métricas y últimas conversaciones"
```

---

### Task 6: Página Conversaciones

**Files:**
- Create: `app/(dashboard)/conversaciones/conversation-list.tsx`, `app/(dashboard)/conversaciones/message-thread.tsx`
- Modify: `app/(dashboard)/conversaciones/page.tsx`

- [ ] **Step 1: Crear la lista**

`app/(dashboard)/conversaciones/conversation-list.tsx`:

```tsx
import Link from "next/link";
import type { Conversation } from "@/lib/conversations";
import { formatShortDate, formatTime } from "@/lib/dates";

export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: Conversation[];
  activeId: string | null;
}) {
  return (
    <div className="w-72 shrink-0 border-r border-tinta/20">
      <p className="border-b border-tinta/20 px-4 py-3 text-lg">
        Conversaciones
      </p>

      {conversations.length === 0 && (
        <p className="px-4 py-6 text-sm text-tinta-suave">
          Todavía no hay conversaciones.
        </p>
      )}

      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href={`/conversaciones?c=${conversation.id}`}
          className={
            conversation.id === activeId
              ? "block border-b border-tinta/20 bg-hueso-hondo px-4 py-3"
              : "block border-b border-tinta/20 px-4 py-3 hover:bg-hueso-hondo"
          }
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">
              {conversation.contact_name ?? conversation.contact_phone}
            </span>
            <span className="shrink-0 text-xs text-tinta-suave">
              {formatShortDate(conversation.last_message_at)}
            </span>
          </div>
          <p className="text-xs text-tinta-suave">
            {formatTime(conversation.last_message_at)}
            {!conversation.bot_active && " · Manual"}
          </p>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Crear el hilo de mensajes**

`app/(dashboard)/conversaciones/message-thread.tsx`:

```tsx
import type { Message } from "@/lib/conversations";
import { formatTime } from "@/lib/dates";

const SENDER_LABEL: Record<Message["sender"], string> = {
  cliente: "Cliente",
  agente_ia: "Agente IA",
  humano: "Humano",
};

function bubbleClass(sender: Message["sender"]): string {
  if (sender === "cliente") {
    return "mr-auto bg-hueso-hondo";
  }
  if (sender === "agente_ia") {
    return "ml-auto bg-oliva text-hueso";
  }
  return "ml-auto bg-tinta text-hueso";
}

export function MessageThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-tinta-suave">Esta conversación no tiene mensajes.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`max-w-[80%] rounded px-4 py-2 ${bubbleClass(
            message.sender
          )}`}
        >
          <p className="mb-1 text-xs opacity-70">
            {SENDER_LABEL[message.sender]} · {formatTime(message.created_at)}
          </p>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Escribir la página**

`app/(dashboard)/conversaciones/page.tsx`:

```tsx
import {
  getConversation,
  getConversations,
  getMessages,
} from "@/lib/conversations";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; error?: string }>;
}) {
  const params = await searchParams;
  const conversations = await getConversations();
  const activeId = params.c ?? conversations[0]?.id ?? null;

  const [conversation, messages] = activeId
    ? await Promise.all([getConversation(activeId), getMessages(activeId)])
    : [null, []];

  return (
    <div className="-mx-8 -my-6 flex min-h-screen">
      <ConversationList
        conversations={conversations}
        activeId={conversation?.id ?? null}
      />

      <div className="flex flex-1 flex-col">
        {!conversation && (
          <p className="px-6 py-6 text-tinta-suave">
            Selecciona una conversación para verla.
          </p>
        )}

        {conversation && (
          <>
            <div className="border-b border-tinta/20 px-6 py-3">
              <p>{conversation.contact_name ?? "Sin nombre"}</p>
              <p className="text-sm text-tinta-suave">
                {conversation.contact_phone}
              </p>
            </div>

            {params.error && (
              <p className="mx-6 mt-4 rounded border border-bermellon px-3 py-2 text-sm text-bermellon">
                {params.error}
              </p>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <MessageThread messages={messages} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Nota: los márgenes negativos (`-mx-8 -my-6`) compensan el padding que el layout del dashboard aplica al contenedor, para que esta pantalla ocupe todo el ancho como en la captura de referencia.

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Verificar con evidencia real**

En `/conversaciones` con los datos de demo:
- Se listan las 3 conversaciones, ordenadas de más reciente a más antigua
- La que tiene el bot pausado (Marcos Ruiz) muestra "· Manual"
- La que no tiene nombre muestra el teléfono (`+34600555666`)
- Al entrar sin `?c=`, se abre automáticamente la primera conversación
- Al hacer clic en otra, la URL cambia a `?c=<id>` y el hilo muestra **sus** mensajes
- La conversación abierta se resalta en la lista
- Los mensajes distinguen visualmente los 3 remitentes (cliente a la izquierda; agente IA y humano a la derecha, con colores distintos) y muestran la hora
- Prueba `?c=<uuid-inexistente>` (un UUID con formato válido pero que no exista) y confirma que muestra "Selecciona una conversación para verla." en vez de romperse

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade la pantalla de Conversaciones con lista e hilo de mensajes"
```

---

### Task 7: Toggle "Bot activo"

**Files:**
- Create: `app/(dashboard)/conversaciones/actions.ts`, `app/(dashboard)/conversaciones/bot-toggle.tsx`
- Modify: `app/(dashboard)/conversaciones/page.tsx`

- [ ] **Step 1: Crear la Server Action**

`app/(dashboard)/conversaciones/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
```

Nota: se revalida también `/dashboard` porque la tarjeta "Bot en pausa" depende de este valor.

- [ ] **Step 2: Crear el componente del toggle**

`app/(dashboard)/conversaciones/bot-toggle.tsx`:

```tsx
import { toggleBot } from "./actions";

export function BotToggle({
  conversationId,
  botActive,
}: {
  conversationId: string;
  botActive: boolean;
}) {
  return (
    <form action={toggleBot} className="flex items-center gap-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="next_value" value={String(!botActive)} />
      <button
        type="submit"
        className={
          botActive
            ? "border border-oliva px-3 py-1 text-sm text-oliva"
            : "border border-bermellon px-3 py-1 text-sm text-bermellon"
        }
      >
        {botActive ? "Bot activo" : "Bot en pausa"}
      </button>
    </form>
  );
}
```

Nota: es un botón que muestra el estado actual y lo alterna al pulsarlo, no una casilla. Así funciona sin JavaScript de cliente y el estado siempre viene del servidor.

- [ ] **Step 3: Conectar en la página**

En `app/(dashboard)/conversaciones/page.tsx`, añade el import:

```tsx
import { BotToggle } from "./bot-toggle";
```

y sustituye el bloque de la cabecera de la conversación por:

```tsx
            <div className="flex items-center justify-between border-b border-tinta/20 px-6 py-3">
              <div>
                <p>{conversation.contact_name ?? "Sin nombre"}</p>
                <p className="text-sm text-tinta-suave">
                  {conversation.contact_phone}
                </p>
              </div>
              <BotToggle
                conversationId={conversation.id}
                botActive={conversation.bot_active}
              />
            </div>
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Verificar con evidencia real**

- Abre una conversación con el bot activo: el botón muestra "Bot activo" en verde oliva
- Púlsalo: pasa a "Bot en pausa" en bermellón, y en la lista de la izquierda aparece "· Manual"
- **Confirma el cambio en base de datos** (`bot_active = false` para esa conversación)
- Vuelve a pulsarlo: regresa a "Bot activo" y desaparece el "· Manual"
- Ve al Dashboard y confirma que la tarjeta **"Bot en pausa" refleja el número correcto** tras los cambios (es la prueba de que el `revalidatePath("/dashboard")` funciona)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade el toggle de bot activo por conversación"
```

---

### Task 8: Responder como humano

**Files:**
- Modify: `app/(dashboard)/conversaciones/actions.ts`, `app/(dashboard)/conversaciones/page.tsx`

- [ ] **Step 1: Añadir la Server Action**

Añade al final de `app/(dashboard)/conversaciones/actions.ts` (reutiliza el `fail()` ya existente):

```ts
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

  // TODO (Fase 4): enviar también el mensaje por la WhatsApp Cloud API.
  // Hasta entonces, el mensaje solo queda registrado en el panel.

  revalidatePath("/conversaciones");
  revalidatePath("/dashboard");
  redirect(`/conversaciones?c=${conversationId}`);
}
```

- [ ] **Step 2: Añadir el formulario de envío**

En `app/(dashboard)/conversaciones/page.tsx`, añade `sendHumanMessage` al import de `./actions`:

```tsx
import { sendHumanMessage } from "./actions";
```

y añade el formulario **justo después** del `<div>` que contiene `<MessageThread />`, todavía dentro del fragmento `<>...</>`:

```tsx
            <form
              action={sendHumanMessage}
              className="flex items-end gap-2 border-t border-tinta/20 px-6 py-4"
            >
              <input
                type="hidden"
                name="conversation_id"
                value={conversation.id}
              />
              <textarea
                name="content"
                rows={2}
                required
                maxLength={1000}
                placeholder="Escribe una respuesta…"
                className="flex-1 border border-tinta bg-hueso px-3 py-2"
              />
              <button type="submit" className="bg-tinta px-4 py-2 text-hueso">
                Enviar
              </button>
            </form>
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Verificar con evidencia real**

- Abre una conversación **con el bot activo**, escribe una respuesta y envíala
- Confirma que el mensaje aparece al final del hilo, con la etiqueta "Humano" y su hora
- **Confirma que el bot ha pasado automáticamente a pausa** (el botón muestra "Bot en pausa" y en la lista aparece "· Manual") — esta es la regla de negocio central de esta tarea
- Verifica en base de datos: hay una fila nueva en `messages` con `sender = 'humano'`, y la conversación tiene `bot_active = false` y el `last_message_at` actualizado
- Confirma que **la conversación sube al principio de la lista** (se ordena por `last_message_at`)
- Camino de error: envía un mensaje vacío o solo con espacios (quitando `required` con JavaScript) y confirma que muestra "Escribe un mensaje antes de enviarlo." **sin crear ninguna fila**

- [ ] **Step 5: Verificación final de toda la Fase 3**

- Recorre Dashboard → Conversaciones → Personalización y confirma que las tres cargan sin errores
- Confirma que las 4 tarjetas del Dashboard siguen cuadrando con la base de datos tras todos los cambios
- Sin errores en la consola del navegador ni en el log del servidor
- Ejecuta la suite completa:

```bash
npm run test
```

Expected: los 2 tests de RLS y los 8 de fechas, todos en verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade el envío de respuestas manuales desde el panel"
```

---

## Self-review de este plan

- **Cobertura del spec (sección 4):** Dashboard con las 4 tarjetas exactas de la captura (Conversaciones 30D, Citas esta semana, Citas hoy, Bot en pausa) y la lista "Últimas conversaciones" con enlace "Ver todas" (Task 5); Conversaciones con lista a la izquierda, hilo con burbujas por remitente y toggle "Bot activo" (Tasks 6-7); escribir como humano pausa el bot automáticamente (Task 8). El envío real por WhatsApp queda explícitamente fuera, marcado con un `TODO` en un único punto del código.
- **Placeholders:** ninguno — todos los pasos llevan código completo o comandos exactos con salida esperada.
- **Consistencia de tipos:** `Conversation` y `Message` se definen en `lib/conversations.ts` (Task 3) y se consumen con el mismo nombre en `ConversationList`, `MessageThread` y las páginas. `DashboardMetrics` se define en `lib/metrics.ts` y solo lo usa el Dashboard. `formatTime`/`formatShortDate`/`todayRange`/`weekRange`/`daysAgo` se definen en `lib/dates.ts` (Task 2) y se usan en Tasks 3, 5 y 6. `fail()` se define en `conversaciones/actions.ts` (Task 7) y lo reutiliza el Task 8. `ACTIVE_BUSINESS_COOKIE` se define en `lib/active-business.ts` (Task 1) y lo usan el lector y la acción del selector.
- **Deuda saldada:** el Task 1 cierra el hueco multi-negocio que la Fase 1 dejó abierto (`/select-business` enlazaba a un parámetro que nadie leía) y elimina el `.single()` que rompía con más de un negocio.
- **Riesgo conocido:** `lib/dates.ts` es la pieza más delicada (aritmética de zona horaria con cambio de hora). Por eso es la única de esta fase con tests unitarios propios, con valores calculados a mano para verano e invierno.
