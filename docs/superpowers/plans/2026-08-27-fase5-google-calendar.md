# Panel de clientes — Fase 5: Google Calendar y pantalla de Citas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el negocio conecte su Google Calendar desde el panel, que el agente consulte la disponibilidad real contra ese calendario antes de proponer horas, que cada cita agendada aparezca como evento en Google, y que el dueño vea todas sus citas en un calendario mensual dentro del panel.

**Architecture:** Un módulo `lib/google/` con tres piezas separadas: OAuth (obtener y refrescar el token), cliente de Calendar (freebusy, crear y listar eventos), y sincronización (traer los eventos de Google a la tabla local). El agente sigue llamando a `findAvailableSlots`, pero la lista de ocupación pasa a venir de Google cuando hay calendario conectado. La tabla `appointments` deja de ser el origen de la verdad y pasa a ser copia de lectura rápida, tal como dice el spec.

**Tech Stack:** Next.js 16 (Route Handlers, Server Actions), TypeScript, Supabase, Google Calendar API v3 vía REST (sin SDK: son tres endpoints y evitamos una dependencia pesada).

> **Restricción de Next.js vigente:** un archivo con `"use server"` **solo puede exportar funciones async**. `tsc` no lo detecta; solo `next build`.

> **Entorno de verificación:** **Supabase en la nube** (sin Docker). Navegador: puerto **3005** y **build de producción** (`npm run build && npx next start -p 3005`) — en `next dev` las Server Actions fallan con `E394`. Usuario: `dev@jctech.local` / `DevPanel1234!` (negocio `caadda18-f2df-4728-8050-186222074a31`). El panel no compone frames: usa `javascript_tool` y `.click()` sobre botones reales. Consultas a la base: script temporal en `.scratch/` (ignorado por git); bórralo al terminar. **Para el servidor por PID del puerto 3005 — nunca `taskkill /F /IM node.exe`.**

**Ver también:**
- Spec: `docs/superpowers/specs/2026-08-18-panel-clientes-design.md` (secciones 2 y 6)
- Fases 1-4 en `docs/superpowers/plans/`

---

## Contexto heredado

- **Esquema ya existente**: `businesses.google_calendar_connected` (bool) y `businesses.google_refresh_token` (text), de la migración 0001. `appointments.google_event_id` (text), de la 0002.
- **Cifrado**: `lib/crypto.ts` con `encryptSecret`/`decryptSecret` (AES-256-GCM), usando `CREDENTIALS_SECRET`. Es lo que ya protege el token de WhatsApp; el de Google va igual.
- **Agente**: `lib/agent/availability.ts` exporta `findAvailableSlots({hours, busy, durationMinutes, from, limit})`, una función pura con 7 tests. `lib/agent/tools.ts` la llama desde `consultar_disponibilidad` y `agendar_cita`, y tiene un `TODO (Fase 5)` marcando dónde crear el evento.
- **Fechas**: `lib/dates.ts` con `todayRange`, `weekRange`, `zonedInstant`, `zonedParts`, `formatTime`, `formatShortDate`, `formatDateTime`, todo en `Europe/Madrid`.
- **Cliente de servicio**: `lib/supabase/service.ts` (`createServiceClient`) para código sin sesión de usuario.
- **Rendimiento**: los lectores repetidos están memorizados con `cache()` de React. Cualquier lector nuevo que se llame más de una vez por petición debe envolverse igual.

## Decisiones de alcance

- **Google Calendar es la fuente de verdad de la ocupación**, como pide el spec. Si el negocio no tiene calendario conectado, se cae a las citas locales — así el agente sigue funcionando sin Google, que es como lo dejó la Fase 4.
- **La sincronización es por sondeo al abrir la pantalla de Citas**, no por webhook push de Google. El push exige un endpoint verificado y renovar el canal cada semana; para un negocio que mira su agenda unas veces al día, sondear al abrir es suficiente y mucho más simple. Queda anotado como mejora futura.
- **Fuera de alcance**: elegir entre varios calendarios de la cuenta (se usa el principal), invitaciones al cliente por email, y editar o cancelar citas desde el panel — el panel las muestra; se gestionan en Google.

## Credenciales necesarias

Esto **lo tiene que hacer el usuario** en [console.cloud.google.com](https://console.cloud.google.com) antes de la Tarea 3:

1. Crear un proyecto.
2. **APIs y servicios → Biblioteca** → habilitar **Google Calendar API**.
3. **Pantalla de consentimiento OAuth** → tipo "Externo" → rellenar nombre y correo → añadir el ámbito `https://www.googleapis.com/auth/calendar` → añadirse como usuario de prueba.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**, con estos **URI de redirección autorizados**:
   - `http://localhost:3005/api/google/callback`
   - `https://jctech-jctech1.vercel.app/api/google/callback`
5. Copiar el **ID de cliente** y el **secreto de cliente**.

| Variable | De dónde sale |
|---|---|
| `GOOGLE_CLIENT_ID` | Paso 5 |
| `GOOGLE_CLIENT_SECRET` | Paso 5 |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3005` en local, la de Vercel en producción |

Las Tareas 1, 2, 4, 5, 6 y 8 se pueden construir y verificar **sin** estas credenciales. Solo las Tareas 3 y 7 necesitan una cuenta de Google real conectada.

---

### Task 1: Migración — datos del calendario conectado

**Files:**
- Create: `supabase/migrations/0005_google_calendar.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- El id del calendario donde se crean los eventos. "primary" es el principal
-- de la cuenta y sirve como valor por defecto.
alter table businesses
  add column google_calendar_id text not null default 'primary';

-- Correo de la cuenta conectada: se muestra en Integraciones para que el
-- negocio sepa qué cuenta está enlazada.
alter table businesses
  add column google_account_email text;

-- Momento de la última sincronización, para poder mostrarlo y para no
-- sincronizar en cada carga de página.
alter table businesses
  add column google_synced_at timestamptz;

-- Las citas creadas desde Google no tienen conversación ni servicio; conviene
-- distinguir su origen para no confundirlas con las que agendó el agente.
alter table appointments
  add column source text not null default 'agente'
  check (source in ('agente', 'google', 'panel'));

-- Un evento de Google se sincroniza una sola vez por negocio.
create unique index if not exists appointments_business_google_event_idx
  on appointments (business_id, google_event_id)
  where google_event_id is not null;
```

- [ ] **Step 2: Aplicar la migración**

```bash
npx supabase db push --db-url "postgresql://postgres.wxuxebjypwetfvgqjrpp:01Abc678%21%29%29@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" --include-all --yes
```

Expected: `Applying migration 0005_google_calendar.sql...` y `Finished supabase db push.`

- [ ] **Step 3: Verificar con una consulta real**

Con un script temporal en `.scratch/`, usando la service_role key, comprueba que:
- `select id, google_calendar_id, google_account_email, google_synced_at from businesses limit 1` no da error y `google_calendar_id` vale `'primary'`
- `select id, source from appointments limit 1` no da error y `source` vale `'agente'`
- Insertar dos citas con el mismo `google_event_id` en el mismo negocio **falla** por el índice único (bórralas después)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade columnas de Google Calendar y origen de las citas"
```

---

### Task 2: OAuth de Google

**Files:**
- Create: `lib/google/oauth.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Escribir el módulo**

`lib/google/oauth.ts`:

```ts
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Solo el ámbito de calendario: nada de correo ni contactos. */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function googleRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;

  if (!base) {
    throw new Error("Falta NEXT_PUBLIC_SITE_URL");
  }

  return `${base.replace(/\/$/, "")}/api/google/callback`;
}

/**
 * URL a la que se manda al usuario para que autorice. `state` viaja de ida y
 * vuelta y sirve para comprobar que la respuesta es de una petición nuestra.
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    // Sin estos dos, Google no devuelve refresh_token en la segunda
    // autorización de la misma cuenta.
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

export type TokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
};

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Google rechazó la petición de token (${response.status})`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresInSeconds: data.expires_in,
  };
}

/** Canjea el código de la redirección por tokens. */
export function exchangeCode(code: string): Promise<TokenResponse> {
  return requestToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: googleRedirectUri(),
  });
}

/** Obtiene un access token nuevo a partir del refresh token guardado. */
export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return requestToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/** Correo de la cuenta autorizada, para mostrarlo en Integraciones. */
export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as { email?: string };
  return data.email ?? null;
}
```

- [ ] **Step 2: Añadir las variables al ejemplo**

En `.env.local.example`, al final:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_SITE_URL=http://localhost:3005
```

Añade también `NEXT_PUBLIC_SITE_URL=http://localhost:3005` a tu `.env.local` (que no se commitea).

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

Expected: 27 tests en verde.

Verifica además, con un script temporal, que `buildAuthUrl("prueba")` produce una URL con `access_type=offline`, `prompt=consent`, el ámbito de calendario y el `redirect_uri` correcto. No hace falta llamar a Google.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade el módulo OAuth de Google"
```

---

### Task 3: Flujo de conexión

**Files:**
- Create: `app/api/google/connect/route.ts`, `app/api/google/callback/route.ts`, `lib/google/tokens.ts`

- [ ] **Step 1: Guardar y recuperar el token**

`lib/google/tokens.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google/oauth";

export async function saveGoogleConnection({
  businessId,
  refreshToken,
  accountEmail,
}: {
  businessId: string;
  refreshToken: string;
  accountEmail: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      google_refresh_token: encryptSecret(refreshToken),
      google_account_email: accountEmail,
      google_calendar_connected: true,
    })
    .eq("id", businessId);

  if (error) throw error;
}

export async function disconnectGoogle(businessId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      google_refresh_token: null,
      google_account_email: null,
      google_calendar_connected: false,
      google_synced_at: null,
    })
    .eq("id", businessId);

  if (error) throw error;
}

/**
 * Access token válido para un negocio, o `null` si no tiene Google conectado.
 * Los access token de Google duran una hora, así que se pide uno nuevo en cada
 * uso en vez de guardarlo: es una llamada barata y evita cachés obsoletas.
 */
export async function getAccessToken(businessId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("businesses")
    .select("google_refresh_token")
    .eq("id", businessId)
    .limit(1);

  const encrypted = data?.[0]?.google_refresh_token as string | null | undefined;

  if (!encrypted) return null;

  try {
    const { accessToken } = await refreshAccessToken(decryptSecret(encrypted));
    return accessToken;
  } catch {
    // El usuario pudo revocar el acceso desde su cuenta de Google.
    return null;
  }
}
```

- [ ] **Step 2: Ruta de inicio**

`app/api/google/connect/route.ts`:

```ts
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google/oauth";
import { getActiveBusinessId } from "@/lib/business";

export const GOOGLE_STATE_COOKIE = "jctech_google_state";

export async function GET() {
  const businessId = await getActiveBusinessId();

  if (!businessId) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  // El state ata la respuesta de Google a esta petición y a este negocio.
  const state = `${crypto.randomBytes(16).toString("hex")}.${businessId}`;

  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
```

- [ ] **Step 3: Ruta de vuelta**

`app/api/google/callback/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, fetchAccountEmail } from "@/lib/google/oauth";
import { saveGoogleConnection } from "@/lib/google/tokens";
import { GOOGLE_STATE_COOKIE } from "../connect/route";

function volver(mensaje?: string) {
  const url = new URL("/integraciones", process.env.NEXT_PUBLIC_SITE_URL);
  if (mensaje) url.searchParams.set("error", mensaje);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const store = await cookies();
  const expected = store.get(GOOGLE_STATE_COOKIE)?.value;
  store.delete(GOOGLE_STATE_COOKIE);

  // Sin esta comprobación, un tercero podría enlazar su calendario al negocio.
  if (!code || !state || !expected || state !== expected) {
    return volver("No se pudo verificar la respuesta de Google.");
  }

  const businessId = state.split(".")[1];

  if (!businessId) {
    return volver("No se pudo verificar la respuesta de Google.");
  }

  try {
    const tokens = await exchangeCode(code);

    if (!tokens.refreshToken) {
      return volver(
        "Google no devolvió permiso permanente. Revoca el acceso en tu cuenta y vuelve a conectar."
      );
    }

    const email = await fetchAccountEmail(tokens.accessToken);

    await saveGoogleConnection({
      businessId,
      refreshToken: tokens.refreshToken,
      accountEmail: email,
    });
  } catch {
    return volver("No se pudo conectar con Google. Inténtalo de nuevo.");
  }

  return volver();
}
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Verificar con evidencia real**

Esta tarea **necesita credenciales de Google**. Si el usuario aún no las ha configurado, verifica lo que se pueda y repórtalo:

Sin credenciales:
- `/api/google/connect` sin sesión → redirige a `/login`
- El callback con un `state` que no coincide con la cookie → redirige a `/integraciones?error=...` **sin guardar nada**. Es la comprobación de seguridad central de esta tarea: pruébala explícitamente.

Con credenciales:
- Entra en `/api/google/connect` con sesión, autoriza en Google, y confirma que vuelves a `/integraciones`
- En base de datos: `google_calendar_connected = true`, `google_account_email` con tu correo, y `google_refresh_token` **cifrado** (no debe contener el token en claro)
- Confirma que `getAccessToken(businessId)` devuelve un token que empieza por `ya29.`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade el flujo de conexión con Google Calendar"
```

---

### Task 4: Cliente de Google Calendar

**Files:**
- Create: `lib/google/calendar.ts`

- [ ] **Step 1: Escribir el cliente**

`lib/google/calendar.ts`:

```ts
import { TIME_ZONE } from "@/lib/dates";

const API = "https://www.googleapis.com/calendar/v3";

export type BusyPeriod = { starts_at: string; ends_at: string };

export type CalendarEvent = {
  id: string;
  summary: string | null;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
};

/** Franjas ocupadas del calendario entre dos instantes. */
export async function fetchBusy({
  accessToken,
  calendarId,
  from,
  to,
}: {
  accessToken: string;
  calendarId: string;
  from: Date;
  to: Date;
}): Promise<BusyPeriod[]> {
  const response = await fetch(`${API}/freeBusy`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar rechazó freeBusy (${response.status})`);
  }

  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };

  const busy = data.calendars?.[calendarId]?.busy ?? [];

  return busy.map((b) => ({ starts_at: b.start, ends_at: b.end }));
}

/** Crea un evento y devuelve su id de Google. */
export async function createEvent({
  accessToken,
  calendarId,
  summary,
  description,
  startsAt,
  endsAt,
}: {
  accessToken: string;
  calendarId: string;
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<string> {
  const response = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: startsAt.toISOString(), timeZone: TIME_ZONE },
        end: { dateTime: endsAt.toISOString(), timeZone: TIME_ZONE },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar rechazó el evento (${response.status})`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/** Eventos del calendario en una ventana, para sincronizarlos al panel. */
export async function listEvents({
  accessToken,
  calendarId,
  from,
  to,
}: {
  accessToken: string;
  calendarId: string;
  from: Date;
  to: Date;
}): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const response = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar rechazó la lista (${response.status})`);
  }

  const data = (await response.json()) as {
    items?: {
      id: string;
      status?: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }[];
  };

  return (data.items ?? [])
    // Los eventos de día completo traen `date` en vez de `dateTime`: no son
    // citas con hora, así que se ignoran.
    .filter((item) => item.start?.dateTime && item.end?.dateTime)
    .map((item) => ({
      id: item.id,
      summary: item.summary ?? null,
      startsAt: item.start!.dateTime!,
      endsAt: item.end!.dateTime!,
      cancelled: item.status === "cancelled",
    }));
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build
```

Expected: sin errores. (No se puede ejercitar sin una cuenta conectada; se prueba en la Tarea 7.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Añade el cliente de Google Calendar"
```

---

### Task 5: Disponibilidad contra Google Calendar

**Files:**
- Modify: `lib/agent/tools.ts`

- [ ] **Step 1: Cambiar el origen de la ocupación**

En `lib/agent/tools.ts`, añade los imports:

```ts
import { getAccessToken } from "@/lib/google/tokens";
import { fetchBusy } from "@/lib/google/calendar";
```

y **reemplaza la función `loadBusy` completa** por:

```ts
/**
 * Franjas ocupadas del negocio. Google Calendar es la fuente de verdad cuando
 * está conectado, porque recoge también lo que el negocio apunta a mano fuera
 * del panel. Sin Google, se usan las citas locales.
 */
async function loadBusy(businessId: string, from: Date): Promise<
  { starts_at: string; ends_at: string }[]
> {
  const supabase = createServiceClient();
  const until = new Date(
    from.getTime() + MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000
  );

  const { data: business } = await supabase
    .from("businesses")
    .select("google_calendar_connected, google_calendar_id")
    .eq("id", businessId)
    .limit(1);

  if (business?.[0]?.google_calendar_connected) {
    const accessToken = await getAccessToken(businessId);

    if (accessToken) {
      try {
        return await fetchBusy({
          accessToken,
          calendarId: (business[0].google_calendar_id as string) ?? "primary",
          from,
          to: until,
        });
      } catch {
        // Si Google falla, es mejor ofrecer huecos según las citas locales que
        // dejar al cliente sin respuesta.
      }
    }
  }

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
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

Expected: 27 tests en verde. Los tests de `findAvailableSlots` no cambian: siguen probando la función pura, que recibe la ocupación ya resuelta.

- [ ] **Step 3: Verificar el comportamiento sin Google conectado**

El negocio de prueba **no** tiene Google conectado, así que debe seguir comportándose exactamente igual que en la Fase 4. En `/personalizacion/probar`, pide una cita y confirma que el agente sigue proponiendo horas correctas dentro del horario. Esta es la comprobación de que la caída a citas locales funciona.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Consulta la disponibilidad contra Google Calendar cuando está conectado"
```

---

### Task 6: Crear el evento al agendar

**Files:**
- Modify: `lib/agent/tools.ts`

- [ ] **Step 1: Sustituir el TODO**

En `lib/agent/tools.ts`, dentro de `agendar_cita`, localiza:

```ts
    // TODO (Fase 5): crear también el evento en Google Calendar.
```

Ese comentario está **después** del `insert` en `appointments`. Reestructura ese tramo para crear primero el evento en Google (si hay calendario) y guardar su id junto a la cita. Sustituye desde `const supabase = createServiceClient();` hasta el `return` final de la rama de `agendar_cita` por:

```ts
    const supabase = createServiceClient();

    // El evento se crea antes de guardar en local para poder registrar su id.
    // Si Google falla, la cita se guarda igual: perderla sería peor que tenerla
    // solo en el panel, y la sincronización posterior no la duplicará porque
    // lleva google_event_id nulo.
    let googleEventId: string | null = null;

    const { data: business } = await supabase
      .from("businesses")
      .select("google_calendar_connected, google_calendar_id")
      .eq("id", context.businessId)
      .limit(1);

    if (business?.[0]?.google_calendar_connected) {
      const accessToken = await getAccessToken(context.businessId);

      if (accessToken) {
        try {
          googleEventId = await createEvent({
            accessToken,
            calendarId: (business[0].google_calendar_id as string) ?? "primary",
            summary: `${service.name} — ${String(args.nombre ?? "")}`,
            description: context.contactPhone
              ? `Reservado por el agente. Teléfono: ${context.contactPhone}`
              : "Reservado por el agente.",
            startsAt,
            endsAt,
          });
        } catch {
          // Se sigue adelante: la cita queda en el panel aunque Google falle.
        }
      }
    }

    const { error } = await supabase.from("appointments").insert({
      business_id: context.businessId,
      conversation_id: context.conversationId,
      service_id: service.id,
      contact_name: String(args.nombre ?? ""),
      contact_phone: context.contactPhone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "confirmada",
      google_event_id: googleEventId,
      source: "agente",
    });

    if (error) {
      return { content: "No se pudo guardar la cita. Pide disculpas y ofrece otra hora." };
    }

    return {
      content: `Cita confirmada: ${service.name} el ${formatDateTime(startsAt)}.`,
    };
```

Añade `createEvent` al import de `@/lib/google/calendar`.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

- [ ] **Step 3: Verificar que sin Google sigue funcionando**

En `/personalizacion/probar` el modo prueba no llega a este código (sale antes con `[modo prueba]`), así que para probarlo de verdad hace falta el webhook. Con un script temporal, llama directamente a `runTool("agendar_cita", {...}, context)` con `dryRun: false` y el negocio de prueba (que no tiene Google), y confirma que:
- La cita se crea en `appointments` con `google_event_id` **nulo** y `source = 'agente'`
- Bórrala después

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Crea el evento en Google Calendar al agendar una cita"
```

---

### Task 7: Sincronización de Google al panel

**Files:**
- Create: `lib/google/sync.ts`

- [ ] **Step 1: Escribir la sincronización**

`lib/google/sync.ts`:

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/google/tokens";
import { listEvents } from "@/lib/google/calendar";

/** No se sincroniza más de una vez cada dos minutos. */
const MIN_INTERVAL_MS = 2 * 60 * 1000;

/** Ventana que se trae de Google: un mes atrás y tres adelante. */
const BACK_DAYS = 30;
const AHEAD_DAYS = 90;

/**
 * Trae los eventos de Google a la tabla local. Es idempotente: los eventos ya
 * conocidos se actualizan por su `google_event_id` en vez de duplicarse.
 *
 * Devuelve `true` si llegó a sincronizar.
 */
export async function syncFromGoogle(
  businessId: string,
  { force = false }: { force?: boolean } = {}
): Promise<boolean> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("businesses")
    .select("google_calendar_connected, google_calendar_id, google_synced_at")
    .eq("id", businessId)
    .limit(1);

  const business = data?.[0];

  if (!business?.google_calendar_connected) return false;

  const syncedAt = business.google_synced_at as string | null;

  if (
    !force &&
    syncedAt &&
    Date.now() - new Date(syncedAt).getTime() < MIN_INTERVAL_MS
  ) {
    return false;
  }

  const accessToken = await getAccessToken(businessId);
  if (!accessToken) return false;

  const now = Date.now();
  const from = new Date(now - BACK_DAYS * 864e5);
  const to = new Date(now + AHEAD_DAYS * 864e5);

  let events;

  try {
    events = await listEvents({
      accessToken,
      calendarId: (business.google_calendar_id as string) ?? "primary",
      from,
      to,
    });
  } catch {
    return false;
  }

  for (const event of events) {
    if (event.cancelled) {
      await supabase
        .from("appointments")
        .update({ status: "cancelada" })
        .eq("business_id", businessId)
        .eq("google_event_id", event.id);
      continue;
    }

    // El índice único (business_id, google_event_id) hace que esto actualice
    // en vez de duplicar cuando el evento ya se conocía.
    await supabase.from("appointments").upsert(
      {
        business_id: businessId,
        google_event_id: event.id,
        contact_name: event.summary,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        status: "confirmada",
        source: "google",
      },
      { onConflict: "business_id,google_event_id" }
    );
  }

  await supabase
    .from("businesses")
    .update({ google_synced_at: new Date().toISOString() })
    .eq("id", businessId);

  return true;
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

- [ ] **Step 3: Verificar con evidencia real**

**Sin Google conectado** (siempre posible): con un script temporal, llama a `syncFromGoogle(businessId)` con el negocio de prueba y confirma que devuelve `false` sin tocar nada.

**Con Google conectado** (solo si el usuario ya configuró credenciales y conectó su cuenta):
- Crea un evento a mano en tu Google Calendar, dentro de los próximos días
- Llama a `syncFromGoogle(businessId, { force: true })`
- Confirma que aparece en `appointments` con `source = 'google'` y su `google_event_id`
- **Llámala dos veces** y confirma que **sigue habiendo una sola fila** (la propiedad importante)
- Cancela el evento en Google, vuelve a sincronizar, y confirma que la fila pasa a `status = 'cancelada'`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Sincroniza los eventos de Google Calendar al panel"
```

---

### Task 8: Pantalla de Citas

**Files:**
- Create: `app/(dashboard)/citas/month-grid.tsx`
- Modify: `app/(dashboard)/citas/page.tsx`, `lib/dates.ts`

- [ ] **Step 1: Añadir utilidades de mes**

Al final de `lib/dates.ts`:

```ts
/** Primer y último instante (exclusivo) de un mes de Madrid. */
export function monthRange(year: number, month: number): { from: Date; to: Date } {
  return {
    from: zonedInstant(year, month, 1),
    to: zonedInstant(year, month + 1, 1),
  };
}

/** Mes actual en Madrid, como {year, month} con month 1-12. */
export function currentMonth(now: Date = new Date()): {
  year: number;
  month: number;
} {
  const p = zonedParts(now);
  return { year: p.year, month: p.month };
}

/** Día del mes (1-31) de un instante, en hora de Madrid. */
export function dayOfMonth(instant: Date): number {
  return zonedParts(instant).day;
}

/** Índice del día de la semana (0 = lunes) del día 1 de ese mes. */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return zonedParts(zonedInstant(year, month, 1)).dayOfWeek;
}

/** Número de días que tiene un mes. */
export function daysInMonth(year: number, month: number): number {
  // El día 0 del mes siguiente es el último del actual.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}
```

- [ ] **Step 2: Añadir el lector de citas del mes**

Al final de `lib/conversations.ts` **no**: crea un archivo propio, `lib/appointments.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { getActiveBusinessId } from "@/lib/business";
import { monthRange } from "@/lib/dates";

export type Appointment = {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  starts_at: string;
  ends_at: string;
  status: "confirmada" | "cancelada" | "completada";
  source: "agente" | "google" | "panel";
};

export async function getMonthAppointments(
  year: number,
  month: number
): Promise<Appointment[]> {
  const businessId = await getActiveBusinessId();
  if (!businessId) return [];

  const { from, to } = monthRange(year, month);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, contact_name, contact_phone, starts_at, ends_at, status, source")
    .eq("business_id", businessId)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at");

  if (error) throw error;
  return (data ?? []) as Appointment[];
}
```

- [ ] **Step 3: Crear la rejilla del mes**

`app/(dashboard)/citas/month-grid.tsx`:

```tsx
import type { Appointment } from "@/lib/appointments";
import { dayOfMonth, daysInMonth, firstWeekdayOfMonth, formatTime } from "@/lib/dates";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function MonthGrid({
  year,
  month,
  appointments,
  today,
}: {
  year: number;
  month: number;
  appointments: Appointment[];
  today: number | null;
}) {
  const total = daysInMonth(year, month);
  const offset = firstWeekdayOfMonth(year, month);

  const byDay = new Map<number, Appointment[]>();
  for (const appointment of appointments) {
    const day = dayOfMonth(new Date(appointment.starts_at));
    byDay.set(day, [...(byDay.get(day) ?? []), appointment]);
  }

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div className="border border-tinta/20">
      <div className="grid grid-cols-7 border-b border-tinta/20">
        {WEEKDAYS.map((day) => (
          <div key={day} className="rotulillo px-3 py-2 text-tinta-suave">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, index) => (
          <div
            key={index}
            className={`min-h-24 border-b border-r border-tinta/10 p-2 ${
              day === today ? "bg-hueso-hondo" : ""
            }`}
          >
            {day && (
              <>
                <span
                  className={`text-sm ${
                    day === today ? "text-bermellon" : "text-tinta-suave"
                  }`}
                >
                  {day}
                </span>

                <div className="mt-1 flex flex-col gap-1">
                  {(byDay.get(day) ?? []).map((appointment) => (
                    <div
                      key={appointment.id}
                      title={`${appointment.contact_name ?? "Sin nombre"} · ${
                        appointment.source === "google"
                          ? "desde Google Calendar"
                          : "reservada por el agente"
                      }`}
                      className={`truncate px-1.5 py-0.5 text-xs ${
                        appointment.status === "cancelada"
                          ? "text-tinta-suave line-through"
                          : appointment.source === "google"
                            ? "bg-oliva/15 text-oliva"
                            : "bg-tinta text-hueso"
                      }`}
                    >
                      {formatTime(appointment.starts_at)}{" "}
                      {appointment.contact_name ?? "Sin nombre"}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Escribir la página**

`app/(dashboard)/citas/page.tsx` (ahora es un stub de 3 líneas):

```tsx
import Link from "next/link";
import { getActiveBusinessId } from "@/lib/business";
import { getMonthAppointments } from "@/lib/appointments";
import { currentMonth, dayOfMonth, monthName } from "@/lib/dates";
import { syncFromGoogle } from "@/lib/google/sync";
import { MonthGrid } from "./month-grid";

export default async function CitasPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const params = await searchParams;
  const actual = currentMonth();

  const year = Number(params.y) || actual.year;
  const month = Math.min(Math.max(Number(params.m) || actual.month, 1), 12);

  // Se traen los cambios hechos directamente en Google antes de pintar.
  const businessId = await getActiveBusinessId();
  if (businessId) {
    await syncFromGoogle(businessId);
  }

  const appointments = await getMonthAppointments(year, month);

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const esMesActual = year === actual.year && month === actual.month;
  const hoy = esMesActual ? dayOfMonth(new Date()) : null;

  const confirmadas = appointments.filter((a) => a.status !== "cancelada");

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-2xl">
            {monthName(month)} {year}
          </h1>
          <p className="text-tinta-suave">
            {confirmadas.length === 0
              ? "Ninguna cita este mes."
              : `${confirmadas.length} cita${confirmadas.length === 1 ? "" : "s"} este mes.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/citas?y=${prev.y}&m=${prev.m}`}
            className="border border-tinta/30 px-3 py-1.5 text-sm hover:border-tinta"
          >
            ←
          </Link>
          <Link
            href="/citas"
            className="border border-tinta/30 px-3 py-1.5 text-sm hover:border-tinta"
          >
            Hoy
          </Link>
          <Link
            href={`/citas?y=${next.y}&m=${next.m}`}
            className="border border-tinta/30 px-3 py-1.5 text-sm hover:border-tinta"
          >
            →
          </Link>
        </div>
      </div>

      <MonthGrid
        year={year}
        month={month}
        appointments={appointments}
        today={hoy}
      />

      <div className="mt-4 flex gap-5 text-sm text-tinta-suave">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-tinta" />
          Reservada por el agente
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-oliva/40" />
          Desde Google Calendar
        </span>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npm run build && npm run test
```

- [ ] **Step 6: Verificar con evidencia real**

Carga datos de demo (`npm run seed caadda18-f2df-4728-8050-186222074a31`), que crean 3 citas incluida una cancelada.

En `/citas`:
1. El mes actual se muestra con su nombre en español y el año
2. Las citas aparecen **en el día correcto** — compáralo con `starts_at` en la base de datos, convertido a hora de Madrid
3. La cita **cancelada** aparece tachada y **no cuenta** en el resumen de arriba
4. El **día de hoy** está resaltado
5. Las flechas cambian de mes y la URL refleja `?y=&m=`
6. **Cruce de año**: desde enero, la flecha izquierda lleva a diciembre del año anterior; desde diciembre, la derecha a enero del siguiente. Pruébalo explícitamente
7. "Hoy" vuelve al mes actual
8. Un mes sin citas muestra "Ninguna cita este mes." sin romperse
9. La rejilla **empieza en lunes** y el día 1 cae en la columna correcta — verifícalo contra un calendario real

- [ ] **Step 7: Verificación final de la Fase 5**

- Recorre Dashboard → Conversaciones → Citas → Personalización sin errores
- `npm run test` → 27 tests en verde
- Sin errores en la consola del navegador ni en el log del servidor

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Añade la pantalla de Citas con calendario mensual"
```

---

## Self-review de este plan

- **Cobertura del spec:** Google Calendar pasa a ser la fuente de verdad de la disponibilidad (Tarea 5) y recibe los eventos que agenda el agente (Tarea 6), con la tabla local como copia sincronizada (Tarea 7) — exactamente lo que el usuario pidió en la conversación de diseño. La pantalla de Citas con calendario mensual (Tarea 8) completa la sección 4 del spec. La conexión OAuth (Tarea 3) cubre la parte de Google de la sección 6; la tarjeta de Integraciones que la lanza es de la Fase 6.
- **Placeholders:** ninguno — todos los pasos llevan código completo o comandos exactos con salida esperada.
- **Consistencia de tipos:** `BusyPeriod` de `lib/google/calendar.ts` encaja con el tipo `Busy` que espera `findAvailableSlots`. `getAccessToken` (Tarea 3) lo usan las Tareas 5, 6 y 7. `CalendarEvent` solo lo consume `syncFromGoogle`. `Appointment` se define en `lib/appointments.ts` (Tarea 8) y lo consume `MonthGrid`. Las utilidades de mes de la Tarea 8 se apoyan en `zonedInstant`/`zonedParts`, que ya existen desde la Fase 4.
- **Degradación sin Google:** cada punto de integración cae a las citas locales si no hay calendario conectado o si Google falla. Un negocio sin Google sigue funcionando exactamente como en la Fase 4 — esto se verifica explícitamente en las Tareas 5 y 7.
- **Riesgo conocido:** la sincronización es por sondeo al abrir la pantalla de Citas, con un mínimo de dos minutos entre pasadas. Un cambio hecho en Google no se refleja hasta que alguien abre esa pantalla. Es una decisión consciente frente al push de Google, que exige renovar el canal periódicamente; queda anotada como mejora futura.
