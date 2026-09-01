# Panel de clientes — Fase 6: Integraciones y Equipo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño del negocio conecte y desconecte WhatsApp y Google Calendar desde el panel, sin scripts ni línea de comandos, y que pueda dar acceso a los empleados de su equipo.

**Architecture:** `/integraciones` pasa de stub a una pantalla con pestañas (Conexiones y Equipo), siguiendo el mismo patrón por query param que Personalización. Las invitaciones se resuelven con una tabla propia y una función de Postgres que las convierte en membresías al entrar el invitado — sin depender del envío de correo, que en el plan gratuito de Supabase es limitado.

**Tech Stack:** Next.js 16 (Server Actions), TypeScript, Tailwind CSS v4, Supabase (Postgres + RLS).

> **Restricción de Next.js vigente:** un archivo con `"use server"` **solo puede exportar funciones async**. `tsc` no lo detecta; solo `next build`.

> **Entorno de verificación:** **Supabase en la nube** (sin Docker). Navegador: puerto **3005** y **build de producción** (`npm run build && npx next start -p 3005`) — en `next dev` las Server Actions fallan con `E394`. Usuario: `dev@jctech.local` / `DevPanel1234!` (negocio `caadda18-f2df-4728-8050-186222074a31`). El panel del navegador no compone frames: usa `javascript_tool`, `.click()` sobre botones reales, y lectura del DOM o del HTML servido. Scripts temporales en `.scratch/` (ignorado por git). **Para el servidor por PID del puerto 3005 — nunca `taskkill /F /IM node.exe`.**

**Ver también:**
- Spec: `docs/superpowers/specs/2026-08-18-panel-clientes-design.md` (secciones 3 y 6)
- Fases 1-5 en `docs/superpowers/plans/`

---

## Contexto heredado

- **Esquema**: `businesses` con `whatsapp_phone_number_id`, `whatsapp_access_token` (cifrado), `whatsapp_connected`, `google_refresh_token` (cifrado), `google_calendar_connected`, `google_calendar_id`, `google_account_email`, `google_synced_at`. `business_members` con `(business_id, user_id, role)` y rol `owner`/`empleado`.
- **RLS**: todo pasa por `is_business_member(business_id)`. La función `create_business(p_name)` es `security definer` y crea negocio + membresía owner de forma atómica.
- **Cifrado**: `lib/crypto.ts` con `encryptSecret`/`decryptSecret`.
- **Google**: `lib/google/tokens.ts` ya tiene `disconnectGoogle(businessId)`, y `/api/google/connect` inicia el flujo OAuth. Están construidos y sin usar desde la interfaz — esta fase los conecta.
- **Convenciones**: validación en servidor antes de tocar la red, constantes con nombre, errores por query param `?error=`, `revalidatePath` tras escribir, `SubmitButton` en formularios que crean datos, y lectores memorizados con `cache()` cuando se llaman más de una vez por petición.

## Decisiones de alcance

- **Las invitaciones no envían correo.** El dueño añade el email a una lista; cuando esa persona entra al panel (con cuenta nueva o existente), la invitación se convierte en membresía automáticamente. El envío de correo depende de configurar SMTP en Supabase, y el plan gratuito limita mucho los correos transaccionales. El dueño avisa a su empleado por su cuenta.
- **`business_members` guarda el email**, denormalizado. Sin él, listar el equipo exigiría leer `auth.users`, que solo es accesible con `service_role` y no debería usarse al renderizar una página.
- **Fuera de alcance**: cambiar el rol de un miembro (owner/empleado tienen hoy el mismo acceso funcional), elegir entre varios calendarios de Google, y el alta del número ante Meta.

---

### Task 1: Migración — invitaciones y email en las membresías

**Files:**
- Create: `supabase/migrations/0007_team.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Email denormalizado: listar el equipo sin él obligaría a leer auth.users con
-- service_role en cada carga de página.
alter table business_members add column email text;

-- Relleno de las membresías que ya existen.
update business_members m
set email = u.email
from auth.users u
where u.id = m.user_id and m.email is null;

create table business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  role business_role not null default 'empleado',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

alter table business_invitations enable row level security;

create policy "members can manage invitations" on business_invitations for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id));

-- El invitado necesita ver su propia invitación aunque todavía no sea miembro.
create policy "invitee can see own invitation" on business_invitations for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

grant select, insert, update, delete on business_invitations to authenticated;
grant select, insert, update, delete on business_invitations to service_role;

-- create_business también guarda el email del dueño.
create or replace function create_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  insert into businesses (name) values (p_name) returning id into v_business_id;

  insert into business_members (business_id, user_id, role, email)
    values (
      v_business_id,
      auth.uid(),
      'owner',
      (select email from auth.users where id = auth.uid())
    );

  return v_business_id;
end;
$$;

-- Convierte en membresías las invitaciones pendientes del usuario actual.
-- Es security definer porque insertar en business_members exige ser owner, y el
-- invitado todavía no lo es; la comprobación real es que la invitación exista
-- para su email.
create or replace function accept_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer := 0;
begin
  select email into v_email from auth.users where id = auth.uid();

  if v_email is null then
    return 0;
  end if;

  insert into business_members (business_id, user_id, role, email)
  select i.business_id, auth.uid(), i.role, v_email
  from business_invitations i
  where lower(i.email) = lower(v_email)
  on conflict (business_id, user_id) do nothing;

  get diagnostics v_count = row_count;

  delete from business_invitations
  where lower(email) = lower(v_email);

  return v_count;
end;
$$;
```

- [ ] **Step 2: Aplicar**

```bash
npx supabase db push --db-url "postgresql://postgres.wxuxebjypwetfvgqjrpp:01Abc678%21%29%29@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" --include-all --yes
```

- [ ] **Step 3: Verificar con consultas reales**

Con un script en `.scratch/` (service_role):

1. `business_members` tiene `email` relleno para las membresías existentes (no nulo).
2. Crear una invitación para un email cualquiera funciona; **duplicarla falla** por la restricción única `(business_id, email)`.
3. **El flujo completo**: crea un usuario nuevo con `admin.auth.admin.createUser`, crea una invitación para su email, inicia sesión con el cliente anon como ese usuario, llama a `rpc("accept_invitations")` y confirma que:
   - Devuelve `1`
   - Aparece una fila en `business_members` con ese `user_id`, rol `empleado` y su email
   - La invitación **ha desaparecido** de `business_invitations`
4. **Llamarla dos veces no duplica**: vuelve a llamar a `accept_invitations()` con el mismo usuario; debe devolver `0` y seguir habiendo una sola membresía.
5. Borra el usuario de prueba y su membresía.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade invitaciones de equipo y email en las membresías"
```

---

### Task 2: Lectores de equipo e integraciones

**Files:**
- Create: `lib/team.ts`, `lib/integrations.ts`

- [ ] **Step 1: Lector del equipo**

`lib/team.ts`:

```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";

export type TeamMember = {
  user_id: string;
  email: string | null;
  role: "owner" | "empleado";
  created_at: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: "owner" | "empleado";
  created_at: string;
};

export const getTeamMembers = cache(async function getTeamMembers(): Promise<
  TeamMember[]
> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("user_id, email, role, created_at")
    .eq("business_id", businessId)
    .order("created_at");

  if (error) throw error;
  return (data ?? []) as TeamMember[];
});

export async function getInvitations(): Promise<Invitation[]> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_invitations")
    .select("id, email, role, created_at")
    .eq("business_id", businessId)
    .order("created_at");

  if (error) throw error;
  return (data ?? []) as Invitation[];
}

/** Rol del usuario actual en el negocio activo. */
export async function getMyRole(): Promise<"owner" | "empleado" | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const members = await getTeamMembers();
  return members.find((m) => m.user_id === user.id)?.role ?? null;
}
```

- [ ] **Step 2: Lector del estado de las integraciones**

`lib/integrations.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";

export type IntegrationsStatus = {
  whatsappConnected: boolean;
  whatsappPhoneNumberId: string | null;
  googleConnected: boolean;
  googleAccountEmail: string | null;
  googleSyncedAt: string | null;
};

const EMPTY: IntegrationsStatus = {
  whatsappConnected: false,
  whatsappPhoneNumberId: null,
  googleConnected: false,
  googleAccountEmail: null,
  googleSyncedAt: null,
};

/**
 * Nunca devuelve los tokens, solo si hay conexión y los datos que se pueden
 * enseñar. Los tokens cifrados no deben salir de la capa de servidor.
 */
export async function getIntegrationsStatus(): Promise<IntegrationsStatus> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return EMPTY;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "whatsapp_connected, whatsapp_phone_number_id, google_calendar_connected, google_account_email, google_synced_at"
    )
    .eq("id", businessId)
    .limit(1);

  if (error) throw error;

  const row = data?.[0];
  if (!row) return EMPTY;

  return {
    whatsappConnected: Boolean(row.whatsapp_connected),
    whatsappPhoneNumberId: (row.whatsapp_phone_number_id as string) ?? null,
    googleConnected: Boolean(row.google_calendar_connected),
    googleAccountEmail: (row.google_account_email as string) ?? null,
    googleSyncedAt: (row.google_synced_at as string) ?? null,
  };
}
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

Expected: 47 tests en verde.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade lectores de equipo y estado de integraciones"
```

---

### Task 3: Aceptar invitaciones al entrar

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Llamar al RPC antes de resolver el negocio**

En `app/(dashboard)/layout.tsx`, **antes** de `const businesses = await getUserBusinesses();`, añade:

```tsx
  // Una invitación pendiente se convierte en membresía en cuanto el invitado
  // entra. Es barato (una llamada) y evita una pantalla de "aceptar" extra.
  const supabase = await createClient();
  await supabase.rpc("accept_invitations");
```

con el import correspondiente:

```tsx
import { createClient } from "@/lib/supabase/server";
```

`getUserBusinesses` está memorizada con `cache()`, así que **debe llamarse después** del RPC para ver la membresía recién creada. Si estuviera antes, el invitado vería el panel vacío en su primera entrada.

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Verificar con evidencia real**

Prueba el flujo completo de invitación de extremo a extremo:

1. Con un script, crea una invitación en `business_invitations` para un email nuevo (por ejemplo `invitado@jctech.local`) en el negocio de prueba.
2. Crea ese usuario con `admin.auth.admin.createUser` (`email_confirm: true`).
3. Inicia sesión en el navegador con ese usuario y entra en `/dashboard`.
4. Confirma que **ve el panel del negocio** (el sidebar muestra "Clínica Dental Ejemplo"), sin pasar por onboarding.
5. Confirma en base de datos que hay una membresía nueva con rol `empleado` y que la invitación **ya no está**.
6. Limpieza: borra ese usuario y su membresía.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Convierte las invitaciones pendientes en membresías al entrar"
```

---

### Task 4: Estructura de pestañas de Integraciones

**Files:**
- Create: `app/(dashboard)/integraciones/tabs.tsx`
- Modify: `app/(dashboard)/integraciones/page.tsx`

- [ ] **Step 1: Componente de pestañas**

`app/(dashboard)/integraciones/tabs.tsx`:

```tsx
import Link from "next/link";

export const TABS = [
  { id: "conexiones", label: "Conexiones" },
  { id: "equipo", label: "Equipo" },
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
          href={`/integraciones?tab=${tab.id}`}
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

- [ ] **Step 2: Página (armazón)**

`app/(dashboard)/integraciones/page.tsx` (ahora es un stub de 3 líneas):

```tsx
import { Tabs, isTabId, type TabId } from "./tabs";

export default async function IntegracionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const active: TabId = isTabId(params.tab) ? params.tab : "conexiones";

  return (
    <>
      <h1 className="mb-1 text-2xl">Integraciones</h1>
      <p className="mb-6 text-tinta-suave">
        Conecta los servicios que el agente usa para operar y da acceso a tu
        equipo.
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

- [ ] **Step 3: Verificar**

`tsc` + `next build`, y en el navegador: las dos pestañas cambian la URL, la activa se resalta, y `?tab=basura` cae en `conexiones`. Prueba también `?ok=1` y `?error=algo`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade estructura de pestañas en Integraciones"
```

---

### Task 5: Tarjeta de Google Calendar

**Files:**
- Create: `app/(dashboard)/integraciones/actions.ts`, `app/(dashboard)/integraciones/conexiones-tab.tsx`
- Modify: `app/(dashboard)/integraciones/page.tsx`

- [ ] **Step 1: Server Actions**

`app/(dashboard)/integraciones/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveBusinessId } from "@/lib/business";
import { disconnectGoogle } from "@/lib/google/tokens";

function fail(tab: string, message: string): never {
  redirect(`/integraciones?tab=${tab}&error=${encodeURIComponent(message)}`);
}

function done(tab: string): never {
  revalidatePath("/integraciones");
  redirect(`/integraciones?tab=${tab}&ok=1`);
}

export async function desconectarGoogle() {
  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("conexiones", "No se pudo desconectar. Inténtalo de nuevo.");
  }

  try {
    await disconnectGoogle(businessId);
  } catch {
    fail("conexiones", "No se pudo desconectar. Inténtalo de nuevo.");
  }

  done("conexiones");
}
```

- [ ] **Step 2: Componente de la pestaña**

`app/(dashboard)/integraciones/conexiones-tab.tsx`:

```tsx
import Link from "next/link";
import type { IntegrationsStatus } from "@/lib/integrations";
import { formatShortDate, formatTime } from "@/lib/dates";
import { SubmitButton } from "@/components/submit-button";
import { desconectarGoogle } from "./actions";

function Estado({ conectado }: { conectado: boolean }) {
  return (
    <span
      className={`rotulillo ${conectado ? "text-oliva" : "text-tinta-suave"}`}
    >
      {conectado ? "Conectado" : "Sin conectar"}
    </span>
  );
}

export function ConexionesTab({ status }: { status: IntegrationsStatus }) {
  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <div className="flex flex-col border border-tinta/20 p-5">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg">Google Calendar</h2>
          <Estado conectado={status.googleConnected} />
        </div>

        <p className="mb-4 flex-1 text-sm text-tinta-suave">
          El agente consulta tu calendario antes de proponer horas y crea ahí
          cada cita que reserva.
        </p>

        {status.googleConnected ? (
          <>
            <p className="mb-1 text-sm">{status.googleAccountEmail}</p>
            <p className="mb-4 text-sm text-tinta-suave">
              {status.googleSyncedAt
                ? `Última sincronización: ${formatShortDate(status.googleSyncedAt)} ${formatTime(status.googleSyncedAt)}`
                : "Sin sincronizar todavía."}
            </p>
            <form action={desconectarGoogle}>
              <SubmitButton
                pendingText="Desconectando…"
                className="border border-bermellon px-4 py-2 text-sm text-bermellon"
              >
                Desconectar
              </SubmitButton>
            </form>
          </>
        ) : (
          <Link
            href="/api/google/connect"
            className="self-start bg-tinta px-4 py-2 text-sm text-hueso"
          >
            Conectar Google Calendar
          </Link>
        )}
      </div>

      <div className="flex flex-col border border-tinta/20 p-5">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg">WhatsApp</h2>
          <Estado conectado={status.whatsappConnected} />
        </div>

        <p className="mb-4 flex-1 text-sm text-tinta-suave">
          El número por el que tus clientes escriben y el agente responde.
        </p>

        <p className="text-sm text-tinta-suave">Se configura más abajo.</p>
      </div>
    </div>
  );
}
```

La tarjeta de WhatsApp se completa en el Task 6; aquí queda con un texto provisional.

- [ ] **Step 3: Conectar en la página**

En `app/(dashboard)/integraciones/page.tsx`, importa `getIntegrationsStatus` y `ConexionesTab`, carga el estado, y sustituye el marcador:

```tsx
  const status = await getIntegrationsStatus();
```

```tsx
      {active === "conexiones" && <ConexionesTab status={status} />}
      {active === "equipo" && (
        <p className="text-tinta-suave">Pestaña: {active}</p>
      )}
```

- [ ] **Step 4: Verificar**

`tsc` + `next build` + 47 tests.

En el navegador, con el negocio de prueba (sin Google conectado):
- La tarjeta muestra "Sin conectar" y el botón "Conectar Google Calendar" apunta a `/api/google/connect`
- Simula el estado conectado poniendo a mano en base de datos `google_calendar_connected = true` y `google_account_email = 'prueba@ejemplo.com'`, recarga, y confirma que muestra "Conectado", el email, y el botón de desconectar
- **Pulsa "Desconectar"** y confirma en base de datos que `google_calendar_connected` vuelve a `false`, `google_refresh_token` a `null` y `google_account_email` a `null`
- Deja el negocio como estaba

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Añade la tarjeta de Google Calendar en Integraciones"
```

---

### Task 6: Tarjeta de WhatsApp

**Files:**
- Modify: `app/(dashboard)/integraciones/actions.ts`, `app/(dashboard)/integraciones/conexiones-tab.tsx`

- [ ] **Step 1: Server Actions**

Añade al final de `app/(dashboard)/integraciones/actions.ts` (reutiliza `fail`/`done`):

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/crypto";

const MAX_PHONE_ID_LENGTH = 40;
const MAX_TOKEN_LENGTH = 500;

export async function guardarWhatsApp(formData: FormData) {
  const phoneNumberId = String(formData.get("phone_number_id") ?? "").trim();
  const accessToken = String(formData.get("access_token") ?? "").trim();

  if (!phoneNumberId || phoneNumberId.length > MAX_PHONE_ID_LENGTH) {
    fail("conexiones", "Introduce un Phone Number ID válido.");
  }

  if (!/^\d+$/.test(phoneNumberId)) {
    fail("conexiones", "El Phone Number ID solo contiene dígitos.");
  }

  if (!accessToken || accessToken.length > MAX_TOKEN_LENGTH) {
    fail("conexiones", "Introduce un token de acceso válido.");
  }

  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("conexiones", "No se pudo guardar. Inténtalo de nuevo.");
  }

  // service_role porque el token va cifrado y no debe pasar por el cliente.
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_access_token: encryptSecret(accessToken),
      whatsapp_connected: true,
    })
    .eq("id", businessId);

  if (error) {
    fail("conexiones", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("conexiones");
}

export async function desconectarWhatsApp() {
  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("conexiones", "No se pudo desconectar. Inténtalo de nuevo.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      whatsapp_connected: false,
    })
    .eq("id", businessId);

  if (error) {
    fail("conexiones", "No se pudo desconectar. Inténtalo de nuevo.");
  }

  done("conexiones");
}
```

Mueve los imports nuevos al principio del archivo.

- [ ] **Step 2: Completar la tarjeta**

En `conexiones-tab.tsx`, sustituye `<p className="text-sm text-tinta-suave">Se configura más abajo.</p>` por:

```tsx
        {status.whatsappConnected ? (
          <>
            <p className="mb-1 text-sm">
              Número: {status.whatsappPhoneNumberId}
            </p>
            <p className="mb-4 text-sm text-tinta-suave">
              El token está guardado cifrado.
            </p>
            <form action={desconectarWhatsApp}>
              <SubmitButton
                pendingText="Desconectando…"
                className="border border-bermellon px-4 py-2 text-sm text-bermellon"
              >
                Desconectar
              </SubmitButton>
            </form>
          </>
        ) : (
          <form action={guardarWhatsApp} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="phone_number_id" className="rotulillo text-tinta-suave">
                Phone Number ID
              </label>
              <input
                id="phone_number_id"
                name="phone_number_id"
                type="text"
                required
                maxLength={40}
                placeholder="111222333444555"
                className="border border-tinta bg-hueso px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="access_token" className="rotulillo text-tinta-suave">
                Token de acceso permanente
              </label>
              <input
                id="access_token"
                name="access_token"
                type="password"
                required
                maxLength={500}
                placeholder="EAAG…"
                className="border border-tinta bg-hueso px-3 py-2 text-sm"
              />
            </div>

            <p className="text-sm text-tinta-suave">
              Los generas en Meta Business Suite, en la configuración de tu
              número de WhatsApp Business.
            </p>

            <SubmitButton
              pendingText="Guardando…"
              className="self-start bg-tinta px-4 py-2 text-sm text-hueso"
            >
              Conectar WhatsApp
            </SubmitButton>
          </form>
        )}
```

Añade `desconectarWhatsApp` y `guardarWhatsApp` al import de `./actions`.

- [ ] **Step 3: Verificar**

`tsc` + `next build` + 47 tests.

En el navegador:
- Con el negocio sin WhatsApp: aparece el formulario
- Introduce un Phone Number ID (`111222333444555`) y un token cualquiera, y guarda
- **Confirma en base de datos** que `whatsapp_phone_number_id` es correcto, `whatsapp_connected = true`, y que `whatsapp_access_token` **no contiene el token en claro** (está cifrado)
- **Confirma que el token se puede descifrar** de vuelta al original con `decryptSecret` — demuestra el ciclo completo
- Recarga: ahora la tarjeta muestra el número y el botón de desconectar
- Camino de error: envía un Phone Number ID con letras (quitando la validación del navegador con JavaScript) y confirma el mensaje "El Phone Number ID solo contiene dígitos." sin guardar
- Pulsa "Desconectar" y confirma que los tres campos vuelven a null/false

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade la tarjeta de WhatsApp en Integraciones"
```

---

### Task 7: Pestaña de Equipo

**Files:**
- Create: `app/(dashboard)/integraciones/equipo-tab.tsx`
- Modify: `app/(dashboard)/integraciones/actions.ts`, `app/(dashboard)/integraciones/page.tsx`

- [ ] **Step 1: Server Actions**

Añade al final de `actions.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { getMyRole } from "@/lib/team";

const MAX_EMAIL_LENGTH = 200;

export async function invitar(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
    fail("equipo", "Introduce un email válido.");
  }

  if ((await getMyRole()) !== "owner") {
    fail("equipo", "Solo el propietario puede invitar a alguien.");
  }

  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("equipo", "No se pudo invitar. Inténtalo de nuevo.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("business_invitations").insert({
    business_id: businessId,
    email,
    invited_by: user?.id ?? null,
  });

  if (error) {
    fail(
      "equipo",
      error.code === "23505"
        ? "Ya has invitado a esa persona."
        : "No se pudo invitar. Inténtalo de nuevo."
    );
  }

  done("equipo");
}

export async function revocarInvitacion(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  if (!id || (await getMyRole()) !== "owner") {
    fail("equipo", "No se pudo revocar la invitación.");
  }

  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("equipo", "No se pudo revocar la invitación.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_invitations")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);

  if (error) {
    fail("equipo", "No se pudo revocar la invitación.");
  }

  done("equipo");
}

export async function quitarMiembro(formData: FormData) {
  const userId = String(formData.get("user_id") ?? "");

  if (!userId || (await getMyRole()) !== "owner") {
    fail("equipo", "No se pudo quitar a esa persona.");
  }

  const businessId = await getActiveBusinessId();

  if (!businessId) {
    fail("equipo", "No se pudo quitar a esa persona.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Quitarse a uno mismo dejaría el negocio sin dueño y sin forma de volver.
  if (user?.id === userId) {
    fail("equipo", "No puedes quitarte a ti mismo del negocio.");
  }

  const { error } = await supabase
    .from("business_members")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", userId);

  if (error) {
    fail("equipo", "No se pudo quitar a esa persona.");
  }

  done("equipo");
}
```

Necesita un GRANT de DELETE en `business_members` para `authenticated`, que **no existe** (la migración 0001 solo dio `select, insert`). Añádelo en una migración nueva, `supabase/migrations/0008_team_grants.sql`:

```sql
-- Quitar a alguien del equipo exige poder borrar su membresía. RLS ya limita
-- el borrado a los negocios de los que el usuario es miembro.
grant delete on business_members to authenticated;

create policy "members can remove memberships"
  on business_members for delete
  using (is_business_member(business_id));
```

Aplícala con el mismo `db push`.

- [ ] **Step 2: Componente**

`app/(dashboard)/integraciones/equipo-tab.tsx`:

```tsx
import type { Invitation, TeamMember } from "@/lib/team";
import { formatShortDate } from "@/lib/dates";
import { SubmitButton } from "@/components/submit-button";
import { invitar, quitarMiembro, revocarInvitacion } from "./actions";

export function EquipoTab({
  members,
  invitations,
  myRole,
  myUserId,
}: {
  members: TeamMember[];
  invitations: Invitation[];
  myRole: "owner" | "empleado" | null;
  myUserId: string | null;
}) {
  const esOwner = myRole === "owner";

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h2 className="mb-3 text-lg">Miembros</h2>

        <div className="border border-tinta/20">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between border-b border-tinta/10 px-4 py-3 last:border-b-0"
            >
              <div>
                <p className="text-sm">
                  {member.email ?? "(sin email)"}
                  {member.user_id === myUserId && (
                    <span className="text-tinta-suave"> · tú</span>
                  )}
                </p>
                <p className="rotulillo text-tinta-suave">
                  {member.role === "owner" ? "Propietario" : "Empleado"}
                </p>
              </div>

              {esOwner && member.user_id !== myUserId && (
                <form action={quitarMiembro}>
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <SubmitButton
                    pendingText="Quitando…"
                    className="text-sm text-bermellon hover:underline"
                  >
                    Quitar
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg">Invitaciones pendientes</h2>

          <div className="border border-tinta/20">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between border-b border-tinta/10 px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm">{invitation.email}</p>
                  <p className="rotulillo text-tinta-suave">
                    Invitado el {formatShortDate(invitation.created_at)}
                  </p>
                </div>

                {esOwner && (
                  <form action={revocarInvitacion}>
                    <input type="hidden" name="id" value={invitation.id} />
                    <SubmitButton
                      pendingText="Revocando…"
                      className="text-sm text-bermellon hover:underline"
                    >
                      Revocar
                    </SubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {esOwner && (
        <div>
          <h2 className="mb-1 text-lg">Invitar a alguien</h2>
          <p className="mb-3 text-sm text-tinta-suave">
            Tendrá acceso al panel en cuanto entre con ese email. Avísale tú:
            no le enviamos ningún correo.
          </p>

          <form action={invitar} className="flex items-end gap-2">
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              placeholder="empleado@ejemplo.com"
              className="flex-1 border border-tinta bg-hueso px-3 py-2 text-sm"
            />
            <SubmitButton
              pendingText="Invitando…"
              className="bg-tinta px-4 py-2 text-sm text-hueso"
            >
              Invitar
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Conectar en la página**

En `page.tsx`, importa lo necesario, carga los datos solo cuando toque la pestaña, y sustituye el marcador restante:

```tsx
  const [members, invitations, myRole] =
    active === "equipo"
      ? await Promise.all([getTeamMembers(), getInvitations(), getMyRole()])
      : [[], [], null];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
```

```tsx
      {active === "equipo" && (
        <EquipoTab
          members={members}
          invitations={invitations}
          myRole={myRole}
          myUserId={user?.id ?? null}
        />
      )}
```

Elimina por completo el `<p>Pestaña: {active}</p>`.

- [ ] **Step 4: Verificar con evidencia real**

En `/integraciones?tab=equipo` con el usuario de prueba (que es owner):

1. Aparece él mismo como **Propietario**, marcado con "· tú", y **sin** botón de quitar (no puede quitarse a sí mismo).
2. **Invita** a `nuevo@jctech.local`. Aparece en "Invitaciones pendientes".
3. **Invitar dos veces** al mismo email → mensaje "Ya has invitado a esa persona." sin crear una segunda fila.
4. **Email inválido** (sin arroba, quitando la validación del navegador) → mensaje de error sin crear nada.
5. **Revoca** la invitación y confirma que desaparece de la base.
6. **Flujo completo**: invita a un email, crea ese usuario, inicia sesión con él, entra en `/dashboard` y confirma que ve el negocio; vuelve a `/integraciones?tab=equipo` con el usuario owner y confirma que ahora aparece como **Empleado**.
7. **Con el usuario empleado**, entra en `/integraciones?tab=equipo` y confirma que **no ve** el formulario de invitar ni los botones de quitar (solo el owner puede).
8. Con el owner, **quita** al empleado y confirma que desaparece de `business_members`.
9. Limpieza: borra el usuario de prueba.

El punto 7 es la comprobación de permisos, y el 8 la de que quitar funciona de verdad.

- [ ] **Step 5: Verificación final de la Fase 6**

- Recorre las 5 secciones del sidebar y confirma que **ninguna es ya un stub**
- `npm run test` → 47 tests en verde
- Sin errores en la consola del navegador ni en el log del servidor

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade la pestaña de Equipo con invitaciones"
```

---

## Self-review de este plan

- **Cobertura del spec:** la sección 6 (tarjetas de estado de WhatsApp y Google Calendar, conectar y desconectar) queda cubierta por las Tareas 5 y 6; la sección 3 (varios usuarios por negocio, invitar por email) por las Tareas 1, 3 y 7. Con esto, **las cinco secciones del sidebar dejan de tener stubs**.
- **Placeholders:** ninguno — todos los pasos llevan código completo o comandos exactos con salida esperada.
- **Consistencia de tipos:** `IntegrationsStatus` se define en `lib/integrations.ts` (Tarea 2) y lo consume `ConexionesTab` (Tareas 5-6). `TeamMember` e `Invitation` se definen en `lib/team.ts` (Tarea 2) y los consume `EquipoTab` (Tarea 7). `fail`/`done` se definen una vez en la Tarea 5 y los reutilizan las Tareas 6 y 7. `disconnectGoogle` viene de la Fase 5 y se usa por primera vez aquí.
- **Permisos:** invitar, revocar y quitar exigen rol `owner`, comprobado en servidor con `getMyRole()`, no solo ocultando botones. La Tarea 7 lo verifica explícitamente entrando como empleado.
- **Deuda saldada:** la Tarea 1 rellena el email de las membresías que ya existen y arregla `create_business`, que hasta ahora dejaba ese campo vacío.
- **Riesgo conocido:** las invitaciones no envían correo. Es una decisión consciente (el plan gratuito de Supabase limita los correos transaccionales) y la interfaz lo dice explícitamente para que el dueño avise por su cuenta.
