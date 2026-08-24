# Panel de clientes — Fase 2: Personalización Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño de un negocio pueda configurar por completo el comportamiento de su agente desde la pantalla de Personalización: identidad y prompt base del agente (General), datos del negocio (Negocio), horarios de atención (Horarios), catálogo de servicios (Servicios) y plantillas de mensajes (Mensajes).

**Architecture:** Cinco pestañas dentro de `/personalizacion`, seleccionadas por query param (`?tab=`) para que todo siga renderizándose en servidor sin JavaScript de cliente. Cada pestaña es un Server Component con su propio formulario, y cada formulario invoca una Server Action que escribe en Supabase y refresca la página con `revalidatePath`. Los datos con cardinalidad variable (horarios y servicios) se gestionan fila a fila con acciones de añadir/eliminar en servidor, evitando estado de cliente.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Tailwind CSS v4, Supabase (Postgres + RLS).

**Ver también:**
- Spec completo: `docs/superpowers/specs/2026-08-18-panel-clientes-design.md` (sección 4, pestaña Personalización)
- Fase 1 (completada): `docs/superpowers/plans/2026-08-18-fase1-fundamentos.md`

---

## Contexto heredado de la Fase 1

Ya existe y está verificado:

- **Esquema**: `businesses` (con `name`, `email`, `tone`, `base_prompt`, `address`, `description`), `business_hours` (`business_id`, `day_of_week` 0-6, `start_time`, `end_time`), `services` (`business_id`, `slug`, `name`, `description`, `duration_minutes`, único por `(business_id, slug)`), `message_templates` (`business_id`, `key`, `content`, único por `(business_id, key)`).
- **RLS y GRANTs**: políticas `for all` vía `is_business_member(business_id)` en las tres tablas de datos, con `grant select, insert, update, delete ... to authenticated` ya aplicados. `businesses` tiene `grant select, update to authenticated`.
- **Helper**: `getUserBusinesses()` en `lib/business.ts` devuelve `{ business_id, role, businesses: { id, name } }[]`.
- **Layout**: `app/(dashboard)/layout.tsx` resuelve el negocio del usuario y pinta el sidebar.
- **Middleware**: protege `/dashboard`, `/onboarding`, `/conversaciones`, `/citas`, `/personalizacion`, `/integraciones`, `/select-business`.
- **Convenciones establecidas** (seguirlas): Server Actions con `"use server"`, validación en servidor **antes** de tocar la red, constantes con nombre para los límites, mensajes de error genéricos vía query param `?error=`, y `redirect()` sin `return` explícito (lanza internamente).

---

### Task 1: Migración — campo de comportamiento del agente

La captura de referencia muestra en General un toggle "Preguntar si es paciente nuevo al agendar" que no tiene columna en el esquema todavía.

**Files:**
- Create: `supabase/migrations/0003_agent_behavior.sql`

- [ ] **Step 1: Escribir la migración**

```bash
npx supabase migration new agent_behavior
```

Renombra el archivo generado a `supabase/migrations/0003_agent_behavior.sql` y escribe:

```sql
alter table businesses
  add column ask_new_patient boolean not null default true;
```

- [ ] **Step 2: Aplicar la migración**

```bash
npx supabase db reset
```

Expected: se reaplican las 3 migraciones sin errores.

- [ ] **Step 3: Verificar la columna con una query real**

```bash
docker exec supabase_db_jctech psql -U postgres -d postgres -c "\d businesses"
```

Expected: aparece `ask_new_patient | boolean | not null default true`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade campo de comportamiento del agente al negocio"
```

---

### Task 2: Helper del negocio activo

`getUserBusinesses()` solo devuelve `id` y `name`. Personalización necesita la fila completa.

**Files:**
- Modify: `lib/business.ts`

- [ ] **Step 1: Añadir el tipo y el helper**

Añade al final de `lib/business.ts` (deja `getUserBusinesses` intacto):

```ts
export type Business = {
  id: string;
  name: string;
  email: string | null;
  tone: string;
  base_prompt: string;
  address: string | null;
  description: string | null;
  ask_new_patient: boolean;
};

export async function getActiveBusiness(): Promise<Business> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, email, tone, base_prompt, address, description, ask_new_patient"
    )
    .limit(1)
    .single();

  if (error) throw error;
  return data as Business;
}
```

Nota: RLS ya restringe `businesses` a los negocios del usuario, así que `.limit(1).single()` devuelve el suyo. Cuando la Fase 3 introduzca el negocio activo por cookie, este helper es el único punto a cambiar.

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Añade helper para leer el negocio activo completo"
```

---

### Task 3: Estructura de pestañas de Personalización

**Files:**
- Create: `app/(dashboard)/personalizacion/tabs.tsx`
- Modify: `app/(dashboard)/personalizacion/page.tsx`

- [ ] **Step 1: Crear el componente de pestañas**

`app/(dashboard)/personalizacion/tabs.tsx`:

```tsx
import Link from "next/link";

export const TABS = [
  { id: "general", label: "General" },
  { id: "negocio", label: "Negocio" },
  { id: "horarios", label: "Horarios" },
  { id: "servicios", label: "Servicios" },
  { id: "mensajes", label: "Mensajes" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function isTabId(value: string | undefined): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export function Tabs({ active }: { active: TabId }) {
  return (
    <nav className="mb-6 flex gap-1 border-b border-tinta/20">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/personalizacion?tab=${tab.id}`}
          className={
            tab.id === active
              ? "border-b-2 border-bermellon px-4 py-2 text-bermellon"
              : "px-4 py-2 text-tinta-suave hover:text-tinta"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Reescribir la página con el shell de pestañas**

`app/(dashboard)/personalizacion/page.tsx`:

```tsx
import { Tabs, isTabId, type TabId } from "./tabs";

export default async function PersonalizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const active: TabId = isTabId(params.tab) ? params.tab : "general";

  return (
    <>
      <h1 className="mb-1 text-2xl">Personalización</h1>
      <p className="mb-6 text-tinta-suave">
        Configura cómo se comporta tu agente y qué sabe de tu negocio.
      </p>

      <Tabs active={active} />

      {params.error && (
        <p className="mb-4 rounded border border-bermellon px-3 py-2 text-sm text-bermellon">
          {params.error}
        </p>
      )}
      {params.ok && (
        <p className="mb-4 rounded border border-oliva px-3 py-2 text-sm text-oliva">
          Cambios guardados.
        </p>
      )}

      <p className="text-tinta-suave">Pestaña: {active}</p>
    </>
  );
}
```

El contenido real de cada pestaña se conecta en los Tasks 4-8; este paso solo deja el armazón navegable.

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Verificar en el navegador**

Arranca `npm run dev`, entra con una cuenta existente y ve a `/personalizacion`. Haz clic en cada una de las 5 pestañas y confirma que la URL cambia (`?tab=negocio`, etc.), que la pestaña activa se resalta en bermellón, y que el texto "Pestaña: X" refleja la seleccionada. Prueba también `?tab=basura` y confirma que cae en `general` sin romper.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Añade estructura de pestañas en Personalización"
```

---

### Task 4: Pestaña General — identidad del agente

**Files:**
- Create: `app/(dashboard)/personalizacion/actions.ts`, `app/(dashboard)/personalizacion/general-tab.tsx`
- Modify: `app/(dashboard)/personalizacion/page.tsx`

- [ ] **Step 1: Crear la Server Action**

`app/(dashboard)/personalizacion/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_BASE_PROMPT_LENGTH = 5000;

export const TONES = [
  "profesional y cálido",
  "formal",
  "cercano y casual",
  "directo",
] as const;

function fail(tab: string, message: string): never {
  redirect(`/personalizacion?tab=${tab}&error=${encodeURIComponent(message)}`);
}

function done(tab: string): never {
  revalidatePath("/personalizacion");
  redirect(`/personalizacion?tab=${tab}&ok=1`);
}

export async function saveGeneral(formData: FormData) {
  const tone = String(formData.get("tone"));
  const basePrompt = String(formData.get("base_prompt") ?? "").trim();
  const askNewPatient = formData.get("ask_new_patient") === "on";

  if (!TONES.includes(tone as (typeof TONES)[number])) {
    fail("general", "Selecciona un tono válido.");
  }

  if (basePrompt.length > MAX_BASE_PROMPT_LENGTH) {
    fail(
      "general",
      `El prompt base no puede superar ${MAX_BASE_PROMPT_LENGTH} caracteres.`
    );
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("general", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      tone,
      base_prompt: basePrompt,
      ask_new_patient: askNewPatient,
    })
    .eq("id", business.id);

  if (error) {
    fail("general", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("general");
}
```

- [ ] **Step 2: Crear el componente de la pestaña**

`app/(dashboard)/personalizacion/general-tab.tsx`:

```tsx
import type { Business } from "@/lib/business";
import { TONES, saveGeneral } from "./actions";

export function GeneralTab({ business }: { business: Business }) {
  return (
    <form action={saveGeneral} className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="tone" className="text-sm">
          Tono
        </label>
        <select
          id="tone"
          name="tone"
          defaultValue={business.tone}
          className="border border-tinta bg-hueso px-3 py-2"
        >
          {TONES.map((tone) => (
            <option key={tone} value={tone}>
              {tone}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="base_prompt" className="text-sm">
          Prompt base
        </label>
        <textarea
          id="base_prompt"
          name="base_prompt"
          rows={14}
          defaultValue={business.base_prompt}
          className="border border-tinta bg-hueso px-3 py-2 font-mono text-sm"
        />
        <p className="text-sm text-tinta-suave">
          Este texto se inyecta como instrucción base del modelo en cada
          respuesta.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="ask_new_patient"
          defaultChecked={business.ask_new_patient}
        />
        Preguntar si es cliente nuevo al agendar
      </label>

      <button type="submit" className="self-start bg-tinta px-4 py-2 text-hueso">
        Guardar
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Conectar la pestaña en la página**

En `app/(dashboard)/personalizacion/page.tsx`, añade los imports:

```tsx
import { getActiveBusiness } from "@/lib/business";
import { GeneralTab } from "./general-tab";
```

Dentro del componente, tras resolver `active`, carga el negocio:

```tsx
  const business = await getActiveBusiness();
```

Y sustituye la línea `<p className="text-tinta-suave">Pestaña: {active}</p>` por:

```tsx
      {active === "general" && <GeneralTab business={business} />}
      {active !== "general" && (
        <p className="text-tinta-suave">Pestaña: {active}</p>
      )}
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Verificar con evidencia real**

Con `npm run dev` y sesión iniciada, ve a `/personalizacion?tab=general`. Cambia el tono a "directo", escribe algo en el prompt base, desmarca el checkbox y pulsa Guardar. Expected: vuelve a la pestaña General con el mensaje "Cambios guardados" y los valores nuevos ya cargados en el formulario.

Confirma en base de datos:

```bash
docker exec supabase_db_jctech psql -U postgres -d postgres -c "select tone, ask_new_patient, left(base_prompt, 40) from businesses;"
```

Expected: refleja exactamente lo que guardaste.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade pestaña General de Personalización"
```

---

### Task 5: Pestaña Negocio — datos del negocio

**Files:**
- Create: `app/(dashboard)/personalizacion/negocio-tab.tsx`
- Modify: `app/(dashboard)/personalizacion/actions.ts`, `app/(dashboard)/personalizacion/page.tsx`

- [ ] **Step 1: Añadir la Server Action**

Añade al final de `app/(dashboard)/personalizacion/actions.ts`:

```ts
const MAX_BUSINESS_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

export async function saveNegocio(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name || name.length > MAX_BUSINESS_NAME_LENGTH) {
    fail(
      "negocio",
      `El nombre debe tener entre 1 y ${MAX_BUSINESS_NAME_LENGTH} caracteres.`
    );
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    fail("negocio", `La dirección no puede superar ${MAX_ADDRESS_LENGTH} caracteres.`);
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    fail(
      "negocio",
      `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`
    );
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("negocio", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      email: email || null,
      address: address || null,
      description: description || null,
    })
    .eq("id", business.id);

  if (error) {
    fail("negocio", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("negocio");
}
```

- [ ] **Step 2: Crear el componente**

`app/(dashboard)/personalizacion/negocio-tab.tsx`:

```tsx
import type { Business } from "@/lib/business";
import { saveNegocio } from "./actions";

export function NegocioTab({ business }: { business: Business }) {
  return (
    <form action={saveNegocio} className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm">
          Nombre del negocio
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={business.name}
          className="border border-tinta bg-hueso px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm">
          Email de contacto
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={business.email ?? ""}
          className="border border-tinta bg-hueso px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="address" className="text-sm">
          Dirección
        </label>
        <input
          id="address"
          name="address"
          type="text"
          maxLength={200}
          defaultValue={business.address ?? ""}
          className="border border-tinta bg-hueso px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm">
          Descripción
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          maxLength={1000}
          defaultValue={business.description ?? ""}
          className="border border-tinta bg-hueso px-3 py-2"
        />
        <p className="text-sm text-tinta-suave">
          El agente usa esta información para responder preguntas sobre tu
          negocio.
        </p>
      </div>

      <button type="submit" className="self-start bg-tinta px-4 py-2 text-hueso">
        Guardar
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Conectar en la página**

En `app/(dashboard)/personalizacion/page.tsx` añade el import `import { NegocioTab } from "./negocio-tab";` y añade la línea de render junto a la de General:

```tsx
      {active === "negocio" && <NegocioTab business={business} />}
```

Actualiza también la condición del placeholder para que excluya `negocio`:

```tsx
      {active !== "general" && active !== "negocio" && (
        <p className="text-tinta-suave">Pestaña: {active}</p>
      )}
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Verificar con evidencia real**

En `/personalizacion?tab=negocio`, cambia nombre, email, dirección y descripción, y guarda. Expected: "Cambios guardados", valores persistidos en el formulario, **y el nombre nuevo también reflejado en el sidebar** (el layout lee de la misma tabla).

```bash
docker exec supabase_db_jctech psql -U postgres -d postgres -c "select name, email, address, description from businesses;"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade pestaña Negocio de Personalización"
```

---

### Task 6: Pestaña Horarios — rangos por día

Cada fila de `business_hours` es un rango. Un día puede tener varios (ej. mañana y tarde).

**Files:**
- Create: `app/(dashboard)/personalizacion/horarios-tab.tsx`
- Modify: `app/(dashboard)/personalizacion/actions.ts`, `app/(dashboard)/personalizacion/page.tsx`, `lib/business.ts`

- [ ] **Step 1: Añadir el lector de horarios**

Añade al final de `lib/business.ts`:

```ts
export type BusinessHour = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export async function getBusinessHours(): Promise<BusinessHour[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_hours")
    .select("id, day_of_week, start_time, end_time")
    .order("day_of_week")
    .order("start_time");

  if (error) throw error;
  return (data ?? []) as BusinessHour[];
}
```

- [ ] **Step 2: Añadir las Server Actions**

Añade al final de `app/(dashboard)/personalizacion/actions.ts`:

```ts
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function addBusinessHour(formData: FormData) {
  const dayOfWeek = Number(formData.get("day_of_week"));
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    fail("horarios", "Selecciona un día válido.");
  }

  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    fail("horarios", "Introduce horas válidas en formato HH:MM.");
  }

  if (startTime >= endTime) {
    fail("horarios", "La hora de fin debe ser posterior a la de inicio.");
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("horarios", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase.from("business_hours").insert({
    business_id: business.id,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
  });

  if (error) {
    fail("horarios", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("horarios");
}

export async function deleteBusinessHour(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  if (!id) {
    fail("horarios", "No se pudo eliminar el rango.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("business_hours").delete().eq("id", id);

  if (error) {
    fail("horarios", "No se pudo eliminar el rango.");
  }

  done("horarios");
}
```

- [ ] **Step 3: Crear el componente**

`app/(dashboard)/personalizacion/horarios-tab.tsx`:

```tsx
import type { BusinessHour } from "@/lib/business";
import { addBusinessHour, deleteBusinessHour } from "./actions";

const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

// day_of_week: 0 = lunes ... 6 = domingo
export function HorariosTab({ hours }: { hours: BusinessHour[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {DAYS.map((day, index) => {
        const dayHours = hours.filter((hour) => hour.day_of_week === index);

        return (
          <div key={day} className="flex flex-col gap-2">
            <p className="text-sm">{day}</p>

            {dayHours.length === 0 && (
              <p className="text-sm text-tinta-suave">Cerrado</p>
            )}

            {dayHours.map((hour) => (
              <div key={hour.id} className="flex items-center gap-3">
                <span className="tabular-nums">
                  {hour.start_time.slice(0, 5)} a {hour.end_time.slice(0, 5)}
                </span>
                <form action={deleteBusinessHour}>
                  <input type="hidden" name="id" value={hour.id} />
                  <button
                    type="submit"
                    className="text-sm text-bermellon hover:underline"
                  >
                    Eliminar
                  </button>
                </form>
              </div>
            ))}

            <form action={addBusinessHour} className="flex items-center gap-2">
              <input type="hidden" name="day_of_week" value={index} />
              <input
                name="start_time"
                type="time"
                required
                defaultValue="09:00"
                className="border border-tinta bg-hueso px-2 py-1"
              />
              <span className="text-sm text-tinta-suave">a</span>
              <input
                name="end_time"
                type="time"
                required
                defaultValue="18:00"
                className="border border-tinta bg-hueso px-2 py-1"
              />
              <button
                type="submit"
                className="border border-tinta px-3 py-1 text-sm"
              >
                Agregar rango
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Conectar en la página**

En `app/(dashboard)/personalizacion/page.tsx`, añade los imports `getBusinessHours` (a la línea de `@/lib/business`) y `import { HorariosTab } from "./horarios-tab";`. Carga los horarios solo cuando toque:

```tsx
  const hours = active === "horarios" ? await getBusinessHours() : [];
```

Añade el render y actualiza el placeholder:

```tsx
      {active === "horarios" && <HorariosTab hours={hours} />}
      {active !== "general" && active !== "negocio" && active !== "horarios" && (
        <p className="text-tinta-suave">Pestaña: {active}</p>
      )}
```

- [ ] **Step 5: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Verificar con evidencia real**

En `/personalizacion?tab=horarios`: añade un rango 09:00-14:00 al lunes, otro 16:00-20:00 al lunes (confirma que un día admite varios), y uno al sábado. Elimina uno. Prueba también un rango inválido (fin anterior al inicio) y confirma que muestra el error sin guardar.

```bash
docker exec supabase_db_jctech psql -U postgres -d postgres -c "select day_of_week, start_time, end_time from business_hours order by day_of_week, start_time;"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Añade pestaña Horarios de Personalización"
```

---

### Task 7: Pestaña Servicios — catálogo

**Files:**
- Create: `app/(dashboard)/personalizacion/servicios-tab.tsx`
- Modify: `app/(dashboard)/personalizacion/actions.ts`, `app/(dashboard)/personalizacion/page.tsx`, `lib/business.ts`

- [ ] **Step 1: Añadir el lector de servicios**

Añade al final de `lib/business.ts`:

```ts
export type Service = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  duration_minutes: number;
};

export async function getServices(): Promise<Service[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, slug, name, description, duration_minutes")
    .order("name");

  if (error) throw error;
  return (data ?? []) as Service[];
}
```

- [ ] **Step 2: Añadir las Server Actions**

Añade al final de `app/(dashboard)/personalizacion/actions.ts`:

```ts
const MAX_SERVICE_NAME_LENGTH = 100;
const MAX_SERVICE_DESCRIPTION_LENGTH = 500;
const MAX_DURATION_MINUTES = 600;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function addService(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const durationMinutes = Number(formData.get("duration_minutes"));

  if (!name || name.length > MAX_SERVICE_NAME_LENGTH) {
    fail(
      "servicios",
      `El nombre debe tener entre 1 y ${MAX_SERVICE_NAME_LENGTH} caracteres.`
    );
  }

  if (description.length > MAX_SERVICE_DESCRIPTION_LENGTH) {
    fail(
      "servicios",
      `La descripción no puede superar ${MAX_SERVICE_DESCRIPTION_LENGTH} caracteres.`
    );
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes > MAX_DURATION_MINUTES
  ) {
    fail(
      "servicios",
      `La duración debe estar entre 1 y ${MAX_DURATION_MINUTES} minutos.`
    );
  }

  const slug = slugify(name);

  if (!slug) {
    fail("servicios", "El nombre debe contener al menos una letra o número.");
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("servicios", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase.from("services").insert({
    business_id: business.id,
    slug,
    name,
    description: description || null,
    duration_minutes: durationMinutes,
  });

  if (error) {
    fail(
      "servicios",
      error.code === "23505"
        ? "Ya existe un servicio con ese nombre."
        : "No se pudo guardar. Inténtalo de nuevo."
    );
  }

  done("servicios");
}

export async function deleteService(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  if (!id) {
    fail("servicios", "No se pudo eliminar el servicio.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", id);

  if (error) {
    fail("servicios", "No se pudo eliminar el servicio.");
  }

  done("servicios");
}
```

Nota: `23505` es el código de Postgres para violación de restricción única — aquí significa que ya existe un servicio con ese slug en el negocio.

- [ ] **Step 3: Crear el componente**

`app/(dashboard)/personalizacion/servicios-tab.tsx`:

```tsx
import type { Service } from "@/lib/business";
import { addService, deleteService } from "./actions";

export function ServiciosTab({ services }: { services: Service[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {services.length === 0 && (
        <p className="text-tinta-suave">
          Todavía no has añadido ningún servicio.
        </p>
      )}

      {services.map((service) => (
        <div
          key={service.id}
          className="flex items-start justify-between border border-tinta/20 px-4 py-3"
        >
          <div>
            <p>{service.name}</p>
            {service.description && (
              <p className="text-sm text-tinta-suave">{service.description}</p>
            )}
            <p className="text-sm text-tinta-suave">
              {service.duration_minutes} min · ID: {service.slug}
            </p>
          </div>
          <form action={deleteService}>
            <input type="hidden" name="id" value={service.id} />
            <button
              type="submit"
              className="text-sm text-bermellon hover:underline"
            >
              Eliminar
            </button>
          </form>
        </div>
      ))}

      <form
        action={addService}
        className="flex flex-col gap-3 border-t border-tinta/20 pt-6"
      >
        <p className="text-sm">Añadir servicio</p>

        <div className="flex gap-3">
          <input
            name="name"
            type="text"
            placeholder="Nombre"
            required
            maxLength={100}
            className="flex-1 border border-tinta bg-hueso px-3 py-2"
          />
          <input
            name="duration_minutes"
            type="number"
            placeholder="Minutos"
            required
            min={1}
            max={600}
            defaultValue={30}
            className="w-32 border border-tinta bg-hueso px-3 py-2"
          />
        </div>

        <textarea
          name="description"
          rows={2}
          placeholder="Descripción (opcional)"
          maxLength={500}
          className="border border-tinta bg-hueso px-3 py-2"
        />

        <button
          type="submit"
          className="self-start bg-tinta px-4 py-2 text-hueso"
        >
          Añadir
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Conectar en la página**

Añade `getServices` al import de `@/lib/business` y `import { ServiciosTab } from "./servicios-tab";`. Carga los datos:

```tsx
  const services = active === "servicios" ? await getServices() : [];
```

Render y placeholder actualizado:

```tsx
      {active === "servicios" && <ServiciosTab services={services} />}
      {active === "mensajes" && (
        <p className="text-tinta-suave">Pestaña: {active}</p>
      )}
```

(Con esto el placeholder ya solo cubre `mensajes`, que se implementa en el Task 8.)

- [ ] **Step 5: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Verificar con evidencia real**

En `/personalizacion?tab=servicios`: añade "Limpieza dental" (45 min) y "Empaste" (60 min). Confirma que los slugs generados son `limpieza-dental` y `empaste`. Intenta añadir otro "Limpieza dental" y confirma que muestra "Ya existe un servicio con ese nombre." Elimina uno. Prueba duración 0 y confirma el error de validación.

```bash
docker exec supabase_db_jctech psql -U postgres -d postgres -c "select slug, name, duration_minutes from services order by name;"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Añade pestaña Servicios de Personalización"
```

---

### Task 8: Pestaña Mensajes — plantillas

**Files:**
- Create: `app/(dashboard)/personalizacion/mensajes-tab.tsx`
- Modify: `app/(dashboard)/personalizacion/actions.ts`, `app/(dashboard)/personalizacion/page.tsx`, `lib/business.ts`

- [ ] **Step 1: Definir las plantillas y su lector**

Añade al final de `lib/business.ts`:

```ts
export const MESSAGE_TEMPLATES = [
  {
    key: "saludo",
    label: "Saludo inicial",
    hint: "Primer mensaje cuando alguien escribe por primera vez.",
  },
  {
    key: "fuera_de_horario",
    label: "Fuera de horario",
    hint: "Respuesta cuando escriben fuera del horario de atención.",
  },
  {
    key: "confirmacion_cita",
    label: "Confirmación de cita",
    hint: "Mensaje al confirmar una cita agendada.",
  },
  {
    key: "traspaso_humano",
    label: "Traspaso a persona",
    hint: "Mensaje al pasar la conversación a una persona del equipo.",
  },
] as const;

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATES)[number]["key"];

export async function getMessageTemplates(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("key, content");

  if (error) throw error;

  return Object.fromEntries(
    (data ?? []).map((row) => [row.key as string, row.content as string])
  );
}
```

- [ ] **Step 2: Añadir la Server Action**

Añade al final de `app/(dashboard)/personalizacion/actions.ts`:

```ts
import { MESSAGE_TEMPLATES } from "@/lib/business";

const MAX_TEMPLATE_LENGTH = 1000;

export async function saveMessageTemplates(formData: FormData) {
  const rows: { key: string; content: string }[] = [];

  for (const template of MESSAGE_TEMPLATES) {
    const content = String(formData.get(template.key) ?? "").trim();

    if (content.length > MAX_TEMPLATE_LENGTH) {
      fail(
        "mensajes",
        `"${template.label}" no puede superar ${MAX_TEMPLATE_LENGTH} caracteres.`
      );
    }

    rows.push({ key: template.key, content });
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("mensajes", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase.from("message_templates").upsert(
    rows.map((row) => ({ ...row, business_id: business.id })),
    { onConflict: "business_id,key" }
  );

  if (error) {
    fail("mensajes", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("mensajes");
}
```

Mueve el import de `MESSAGE_TEMPLATES` junto al resto de imports al principio del archivo (no lo dejes en medio).

- [ ] **Step 3: Crear el componente**

`app/(dashboard)/personalizacion/mensajes-tab.tsx`:

```tsx
import { MESSAGE_TEMPLATES } from "@/lib/business";
import { saveMessageTemplates } from "./actions";

export function MensajesTab({
  templates,
}: {
  templates: Record<string, string>;
}) {
  return (
    <form
      action={saveMessageTemplates}
      className="flex max-w-2xl flex-col gap-5"
    >
      {MESSAGE_TEMPLATES.map((template) => (
        <div key={template.key} className="flex flex-col gap-1">
          <label htmlFor={template.key} className="text-sm">
            {template.label}
          </label>
          <textarea
            id={template.key}
            name={template.key}
            rows={3}
            maxLength={1000}
            defaultValue={templates[template.key] ?? ""}
            className="border border-tinta bg-hueso px-3 py-2"
          />
          <p className="text-sm text-tinta-suave">{template.hint}</p>
        </div>
      ))}

      <button type="submit" className="self-start bg-tinta px-4 py-2 text-hueso">
        Guardar
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Conectar en la página**

Añade `getMessageTemplates` al import de `@/lib/business` y `import { MensajesTab } from "./mensajes-tab";`. Carga los datos:

```tsx
  const templates = active === "mensajes" ? await getMessageTemplates() : {};
```

Sustituye el placeholder restante por el render real:

```tsx
      {active === "mensajes" && <MensajesTab templates={templates} />}
```

Ya no queda ninguna pestaña con placeholder: elimina por completo el bloque `<p className="text-tinta-suave">Pestaña: {active}</p>`.

- [ ] **Step 5: Verificar que compila**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Verificar con evidencia real**

En `/personalizacion?tab=mensajes`: rellena las 4 plantillas y guarda. Recarga y confirma que persisten. Modifica una y guarda de nuevo — confirma que se actualiza en vez de duplicarse (el `upsert` con `onConflict`).

```bash
docker exec supabase_db_jctech psql -U postgres -d postgres -c "select key, left(content, 40) from message_templates order by key;"
```

Expected: exactamente 4 filas, sin duplicados tras varios guardados.

- [ ] **Step 7: Verificación final de toda la fase**

Recorre las 5 pestañas seguidas y confirma que cada una carga sus datos guardados, que el sidebar muestra el nombre actualizado del negocio, y que no hay errores en la consola del navegador ni en el log del dev server.

```bash
npm run test
```

Expected: los 2 tests de RLS de la Fase 1 siguen pasando.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Añade pestaña Mensajes de Personalización"
```

---

## Self-review de este plan

- **Cobertura del spec:** cubre las 5 pestañas de la sección 4 del spec (General con tono + prompt base + toggle; Negocio con nombre/dirección/descripción, más email; Horarios con varios rangos por día; Servicios con nombre/duración/descripción/id interno; Mensajes con plantillas). El botón "Probar agente" del spec queda **fuera de esta fase** a propósito: depende del agente de Claude, que es la Fase 4.
- **Placeholders:** ninguno — todos los pasos llevan código completo o comandos exactos con salida esperada.
- **Consistencia de tipos:** `Business` (Task 2) se consume en `GeneralTab` y `NegocioTab`; `BusinessHour` (Task 6), `Service` (Task 7) y `MESSAGE_TEMPLATES` (Task 8) se definen en `lib/business.ts` y se importan con el mismo nombre en sus componentes y acciones. `fail()`/`done()` se definen una vez en el Task 4 y se reutilizan en los Tasks 5-8. El campo `ask_new_patient` de la migración del Task 1 se usa en el tipo del Task 2 y en el formulario del Task 4.
- **Convención de `day_of_week`:** el esquema solo obliga a 0-6; este plan fija 0 = lunes … 6 = domingo, documentado en un comentario dentro de `horarios-tab.tsx` para que las fases posteriores (agente y calendario) usen la misma convención.
