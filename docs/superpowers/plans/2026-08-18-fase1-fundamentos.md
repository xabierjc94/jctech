# Panel de clientes — Fase 1: Fundamentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tener el proyecto Next.js arrancando con la identidad visual de JC Tech, Supabase configurado con el esquema completo de datos (con RLS multi-tenant), y un flujo de auth + onboarding + selector de negocio funcionando de extremo a extremo, aunque las 5 páginas del dashboard sean todavía stubs vacíos.

**Architecture:** Next.js 15 (App Router, TypeScript) + Tailwind v4 + Supabase (Auth + Postgres). Multi-tenant vía tabla `business_members` con RLS basada en una función `is_business_member()`. Creación de negocio atómica vía función Postgres `create_business()`. Este plan es la base de la que dependen todas las fases siguientes (Personalización, Dashboard/Conversaciones, Agente WhatsApp, Google Calendar).

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v4, @supabase/supabase-js, @supabase/ssr, Supabase CLI, Vitest.

**Ver también:** spec completo en `docs/superpowers/specs/2026-08-18-panel-clientes-design.md`.

---

## Fases posteriores (fuera de este plan, para referencia)

- **Fase 2 — Personalización:** CRUD de `business_hours`, `services`, `message_templates`, pestaña General/Negocio.
- **Fase 3 — Dashboard y Conversaciones:** tarjetas del dashboard, chat de conversaciones, toggle bot activo.
- **Fase 4 — Agente WhatsApp + Claude:** webhook, tools, envío/recepción real.
- **Fase 5 — Google Calendar + Citas:** OAuth, sincronización, calendario mensual.
- **Fase 6 — Integraciones + Equipo:** conexión de credenciales, invitar miembros.

---

### Task 1: Inicializar el proyecto Next.js

**Files:**
- Create: todo el scaffold estándar de `create-next-app` (`app/layout.tsx`, `app/page.tsx`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `postcss.config.mjs`, etc.)

- [ ] **Step 1: Generar el proyecto**

Desde `C:\Users\xabie\jctech` (el repo ya tiene `docs/` y `.git`, `create-next-app` puede correr en un directorio no vacío mientras no haya colisión de nombres de archivo):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Verificar que arranca**

```bash
npm run dev
```

Expected: servidor en `http://localhost:3000` sirviendo la página de bienvenida por defecto de Next.js, sin errores en consola.

Para el navegador de Claude Code: `Ctrl+C` para parar el servidor tras comprobarlo.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Inicializa proyecto Next.js con TypeScript y Tailwind"
```

---

### Task 2: Aplicar la identidad visual de JC Tech

**Files:**
- Create: `public/fonts/fraunces-600.woff2`, `public/fonts/karla-400.woff2`, `public/fonts/karla-600.woff2`
- Modify: `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Copiar las fuentes desde jctech-landing**

```bash
mkdir -p public/fonts
cp ../jctech-landing/public/fonts/fraunces-600.woff2 public/fonts/
cp ../jctech-landing/public/fonts/karla-400.woff2 public/fonts/
cp ../jctech-landing/public/fonts/karla-600.woff2 public/fonts/
```

Si `jctech-landing` no está en el directorio hermano, ajusta la ruta de origen al checkout local de ese repo.

- [ ] **Step 2: Reemplazar `app/globals.css`**

```css
@import "tailwindcss";

@font-face {
  font-family: "Fraunces";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/fraunces-600.woff2") format("woff2");
}

@font-face {
  font-family: "Karla";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/karla-400.woff2") format("woff2");
}

@font-face {
  font-family: "Karla";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/karla-600.woff2") format("woff2");
}

@theme {
  --color-hueso: #f3efe7;
  --color-hueso-hondo: #e8e2d6;
  --color-tinta: #17150f;
  --color-tinta-suave: #4a463c;
  --color-bermellon: #c0451f;
  --color-oliva: #5b6249;

  --font-display: "Fraunces", serif;
  --font-sans: "Karla", sans-serif;
}

@layer base {
  html {
    background-color: var(--color-hueso);
    color: var(--color-tinta);
  }

  body {
    font-family: var(--font-sans);
    font-size: 1.0625rem;
    line-height: 1.6;
  }

  h1,
  h2,
  h3,
  .cifra {
    font-family: var(--font-display);
    font-weight: 600;
  }

  a,
  button {
    transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease, opacity 150ms ease;
  }

  :focus-visible {
    outline: 3px solid var(--color-bermellon);
    outline-offset: 3px;
  }
}
```

- [ ] **Step 3: Simplificar `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JC Tech — Panel",
  description: "Panel de gestión del agente de WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Reemplazar `app/page.tsx` con un placeholder de marca**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-3xl">JC Tech — Panel</h1>
    </main>
  );
}
```

- [ ] **Step 5: Verificar visualmente**

```bash
npm run dev
```

Abre `http://localhost:3000` y confirma que el título "JC Tech — Panel" se ve en Fraunces (serif) sobre fondo hueso (#f3efe7).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Aplica la identidad visual de JC Tech (Fraunces/Karla, paleta hueso)"
```

---

### Task 3: Instalar y configurar el cliente de Supabase

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `.env.local.example`
- Modify: `package.json`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Instalar la Supabase CLI e inicializar el proyecto local**

```bash
npx supabase init
```

Expected: crea la carpeta `supabase/` con `config.toml`.

- [ ] **Step 3: Crear `lib/supabase/client.ts` (cliente de navegador)**

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Crear `lib/supabase/server.ts` (cliente de servidor)**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Se ignora si se llama desde un Server Component sin
            // capacidad de escritura; el middleware refresca la sesión.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Crear `.env.local.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`.env.local` (con valores reales, obtenidos de `npx supabase status` tras el Task 4) ya queda ignorado por el `.gitignore` que genera `create-next-app` (incluye `.env*.local`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Configura clientes de Supabase (browser y server)"
```

---

### Task 4: Migración de base de datos — negocios y miembros

**Files:**
- Create: `supabase/migrations/0001_businesses.sql`

- [ ] **Step 1: Arrancar Supabase local**

Requiere Docker Desktop corriendo.

```bash
npx supabase start
```

Expected: imprime `API URL`, `anon key` y `service_role key` — cópialos a `.env.local` (crear el archivo a partir de `.env.local.example`).

- [ ] **Step 2: Escribir la migración**

```bash
npx supabase migration new businesses
```

Esto crea `supabase/migrations/<timestamp>_businesses.sql`. Renómbralo a `supabase/migrations/0001_businesses.sql` y escribe:

```sql
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  tone text not null default 'profesional y cálido'
    check (tone in ('profesional y cálido', 'formal', 'cercano y casual', 'directo')),
  base_prompt text not null default '',
  address text,
  description text,
  google_calendar_connected boolean not null default false,
  google_refresh_token text,
  whatsapp_connected boolean not null default false,
  whatsapp_phone_number_id text,
  whatsapp_access_token text,
  created_at timestamptz not null default now()
);

create type business_role as enum ('owner', 'empleado');

create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role business_role not null default 'empleado',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

alter table businesses enable row level security;
alter table business_members enable row level security;

create or replace function is_business_member(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;

create policy "members can read their business"
  on businesses for select
  using (is_business_member(id));

create policy "members can update their business"
  on businesses for update
  using (is_business_member(id));

create policy "members can read membership rows of their businesses"
  on business_members for select
  using (is_business_member(business_id));

create policy "owners can add members"
  on business_members for insert
  with check (
    exists (
      select 1 from business_members bm
      where bm.business_id = business_members.business_id
        and bm.user_id = auth.uid()
        and bm.role = 'owner'
    )
  );

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
  insert into business_members (business_id, user_id, role)
    values (v_business_id, auth.uid(), 'owner');
  return v_business_id;
end;
$$;
```

- [ ] **Step 3: Aplicar la migración**

```bash
npx supabase db reset
```

Expected: recrea la base local aplicando todas las migraciones sin errores.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade migración de businesses y business_members con RLS multi-tenant"
```

---

### Task 5: Migración de base de datos — resto de tablas

**Files:**
- Create: `supabase/migrations/0002_business_data.sql`

- [ ] **Step 1: Escribir la migración**

```bash
npx supabase migration new business_data
```

Renombra a `supabase/migrations/0002_business_data.sql`:

```sql
create table business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null
);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  unique (business_id, slug)
);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  key text not null,
  content text not null,
  unique (business_id, key)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  contact_name text,
  contact_phone text not null,
  bot_active boolean not null default true,
  last_message_at timestamptz not null default now(),
  unique (business_id, contact_phone)
);

create type message_sender as enum ('cliente', 'agente_ia', 'humano');

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender message_sender not null,
  content text not null,
  created_at timestamptz not null default now()
);

create type appointment_status as enum ('confirmada', 'cancelada', 'completada');

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  google_event_id text,
  conversation_id uuid references conversations(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  contact_name text,
  contact_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'confirmada',
  created_at timestamptz not null default now()
);

alter table business_hours enable row level security;
alter table services enable row level security;
alter table message_templates enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table appointments enable row level security;

create policy "members can manage business_hours" on business_hours for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage services" on services for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage message_templates" on message_templates for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage conversations" on conversations for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage appointments" on appointments for all
  using (is_business_member(business_id)) with check (is_business_member(business_id));

create policy "members can manage messages" on messages for all
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and is_business_member(c.business_id)
    )
  )
  with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id and is_business_member(c.business_id)
    )
  );
```

- [ ] **Step 2: Aplicar la migración**

```bash
npx supabase db reset
```

Expected: sin errores, las 6 tablas nuevas visibles en `npx supabase status` → Studio URL.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Añade migración de horarios, servicios, conversaciones, mensajes y citas"
```

---

### Task 6: Test de aislamiento RLS entre negocios

**Files:**
- Create: `tests/rls.test.ts`, `vitest.config.ts`
- Modify: `package.json` (script `test`)

- [ ] **Step 1: Instalar Vitest**

```bash
npm install -D vitest dotenv
```

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Añadir script en `package.json`**

```json
"scripts": {
  "test": "vitest run"
}
```

- [ ] **Step 4: Escribir el test que falla primero**

`tests/rls.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function signUpAndCreateBusiness(email: string, businessName: string) {
  const client = createClient(url, anonKey);
  const password = "Test1234!";

  const { error: signUpError } = await client.auth.signUp({ email, password });
  if (signUpError) throw signUpError;

  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: businessId, error: rpcError } = await client.rpc(
    "create_business",
    { p_name: businessName }
  );
  if (rpcError) throw rpcError;

  return { client, businessId: businessId as string, userId: signInData.user!.id };
}

describe("aislamiento RLS entre negocios", () => {
  it("un usuario no puede leer el negocio de otro usuario", async () => {
    const a = await signUpAndCreateBusiness(
      `owner-a-${Date.now()}@example.com`,
      "Negocio A"
    );
    const b = await signUpAndCreateBusiness(
      `owner-b-${Date.now()}@example.com`,
      "Negocio B"
    );

    const { data: aReadsOwn } = await a.client
      .from("businesses")
      .select("id")
      .eq("id", a.businessId);
    expect(aReadsOwn).toHaveLength(1);

    const { data: aReadsB } = await a.client
      .from("businesses")
      .select("id")
      .eq("id", b.businessId);
    expect(aReadsB).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Ejecutar y verificar que falla por falta de variables de entorno o conexión**

```bash
npx dotenv -e .env.local -- npx vitest run
```

Expected antes de tener `.env.local` con la URL local: FAIL (variables undefined o conexión rechazada). Confirma que el test realmente ejercita la conexión (no un falso positivo).

Con `.env.local` ya relleno (Task 4, Step 1) y Supabase local corriendo, ejecuta:

```bash
npm run test
```

Expected en este punto: el test debería PASAR, porque las políticas RLS del Task 4 ya están aplicadas. Si falla, revisa la política `"members can read their business"` del Task 4.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade test de aislamiento RLS entre negocios"
```

---

### Task 7: Páginas de login y registro

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`

- [ ] **Step 1: Crear la Server Action de auth**

`app/(auth)/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/onboarding");
}
```

- [ ] **Step 2: Crear la página**

`app/(auth)/login/page.tsx`:

```tsx
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl">Entrar al panel</h1>

      {error && (
        <p className="rounded border border-bermellon px-3 py-2 text-sm text-bermellon">
          {error}
        </p>
      )}

      <form className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="border border-tinta bg-hueso px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña"
          required
          minLength={8}
          className="border border-tinta bg-hueso px-3 py-2"
        />
        <div className="flex gap-2">
          <button
            formAction={signIn}
            className="flex-1 bg-tinta px-4 py-2 text-hueso"
          >
            Entrar
          </button>
          <button
            formAction={signUp}
            className="flex-1 border border-tinta px-4 py-2"
          >
            Crear cuenta
          </button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verificar manualmente**

```bash
npm run dev
```

Ve a `http://localhost:3000/login`, crea una cuenta con un email de prueba. Expected: redirige a `/onboarding` (404 esperado hasta el Task 8) sin errores de consola relacionados con Supabase.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade páginas de login y registro"
```

---

### Task 8: Onboarding — creación del primer negocio

**Files:**
- Create: `app/onboarding/page.tsx`, `app/onboarding/actions.ts`

- [ ] **Step 1: Server Action para crear el negocio**

`app/onboarding/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createBusiness(formData: FormData) {
  const name = String(formData.get("name"));
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("create_business", { p_name: name });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}
```

- [ ] **Step 2: Página de onboarding**

`app/onboarding/page.tsx`:

```tsx
import { createBusiness } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl">Crea tu negocio</h1>
      <p className="text-tinta-suave">
        Este será el nombre que verás en el panel y en las conversaciones de
        WhatsApp.
      </p>

      {error && (
        <p className="rounded border border-bermellon px-3 py-2 text-sm text-bermellon">
          {error}
        </p>
      )}

      <form action={createBusiness} className="flex flex-col gap-3">
        <input
          name="name"
          type="text"
          placeholder="Nombre del negocio"
          required
          className="border border-tinta bg-hueso px-3 py-2"
        />
        <button type="submit" className="bg-tinta px-4 py-2 text-hueso">
          Crear negocio
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verificar manualmente**

Con el flujo de registro del Task 7, completa el formulario de onboarding. Expected: redirige a `/dashboard` (404 esperado hasta el Task 9) y en Supabase Studio local (`npx supabase status` → Studio URL) aparece una fila en `businesses` y otra en `business_members` con `role = owner`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Añade onboarding para crear el primer negocio"
```

---

### Task 9: Middleware de sesión y protección de rutas

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Escribir el middleware**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/onboarding");

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding"],
};
```

- [ ] **Step 2: Verificar manualmente**

Cierra sesión (borra las cookies de `localhost:3000` desde las herramientas del navegador) y visita `http://localhost:3000/dashboard`. Expected: redirige a `/login`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Añade middleware de protección de rutas autenticadas"
```

---

### Task 10: Layout del dashboard con sidebar y selector de negocio

**Files:**
- Create: `app/(dashboard)/layout.tsx`, `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/conversaciones/page.tsx`, `app/(dashboard)/citas/page.tsx`, `app/(dashboard)/personalizacion/page.tsx`, `app/(dashboard)/integraciones/page.tsx`, `app/select-business/page.tsx`, `lib/business.ts`

- [ ] **Step 1: Helper para resolver el negocio activo**

`lib/business.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export type BusinessMembership = {
  business_id: string;
  role: "owner" | "empleado";
  businesses: { id: string; name: string };
};

export async function getUserBusinesses(): Promise<BusinessMembership[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(id, name)");

  if (error) throw error;
  return (data ?? []) as unknown as BusinessMembership[];
}
```

- [ ] **Step 2: Página de selección de negocio (para usuarios con más de uno)**

`app/select-business/page.tsx`:

```tsx
import Link from "next/link";
import { getUserBusinesses } from "@/lib/business";

export default async function SelectBusinessPage() {
  const businesses = await getUserBusinesses();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl">Elige un negocio</h1>
      {businesses.map((b) => (
        <Link
          key={b.business_id}
          href={`/dashboard?business=${b.business_id}`}
          className="border border-tinta px-4 py-3"
        >
          {b.businesses.name}
        </Link>
      ))}
    </main>
  );
}
```

Nota: la selección se pasa como query param `?business=` en esta fase; en la Fase 3 se sustituye por una cookie persistente cuando el layout del dashboard ya renderice contenido real que dependa del negocio activo en cada página.

- [ ] **Step 3: Layout del dashboard con sidebar**

`app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserBusinesses } from "@/lib/business";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/conversaciones", label: "Conversaciones" },
  { href: "/citas", label: "Citas" },
  { href: "/personalizacion", label: "Personalización" },
  { href: "/integraciones", label: "Integraciones" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const businesses = await getUserBusinesses();

  if (businesses.length === 0) {
    redirect("/onboarding");
  }

  if (businesses.length > 1) {
    redirect("/select-business");
  }

  const business = businesses[0].businesses;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-tinta px-4 py-6">
        <p className="text-xs uppercase text-tinta-suave">Negocio</p>
        <p className="mb-6 text-lg">{business.name}</p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 hover:bg-hueso-hondo"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 px-8 py-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Páginas stub de las 5 secciones**

`app/(dashboard)/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return <h1 className="text-2xl">Dashboard</h1>;
}
```

`app/(dashboard)/conversaciones/page.tsx`:

```tsx
export default function ConversacionesPage() {
  return <h1 className="text-2xl">Conversaciones</h1>;
}
```

`app/(dashboard)/citas/page.tsx`:

```tsx
export default function CitasPage() {
  return <h1 className="text-2xl">Citas</h1>;
}
```

`app/(dashboard)/personalizacion/page.tsx`:

```tsx
export default function PersonalizacionPage() {
  return <h1 className="text-2xl">Personalización</h1>;
}
```

`app/(dashboard)/integraciones/page.tsx`:

```tsx
export default function IntegracionesPage() {
  return <h1 className="text-2xl">Integraciones</h1>;
}
```

- [ ] **Step 5: Verificar manualmente el flujo completo**

```bash
npm run dev
```

Flujo: `/login` (crear cuenta) → `/onboarding` (crear negocio) → `/dashboard` (sidebar visible con las 5 secciones y el nombre del negocio arriba). Navega por cada enlace del sidebar y confirma que cada stub carga sin error.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Añade layout del dashboard con sidebar y selector de negocio"
```

---

## Self-review de este plan

- **Cobertura del spec (secciones 1-4 del spec):** Task 1-2 cubren la sección 1 (stack) y 7 (identidad visual). Task 4-6 cubren la sección 2 (modelo de datos) incluyendo el matiz de `appointments` como copia local acordado en la conversación. Task 3, 7-10 cubren la sección 3 (auth y multi-tenant) completa, incluyendo el selector de negocio para usuarios con varios. Las secciones 5 (agente), 6 (integraciones) y 8 (testing/despliegue final) quedan para las fases 2-6 listadas al principio.
- **Placeholders:** ninguno — todos los pasos tienen código completo o comandos exactos con salida esperada.
- **Consistencia de tipos:** `create_business(p_name text) returns uuid` (Task 4) se invoca igual en `tests/rls.test.ts` (Task 6) y en `app/onboarding/actions.ts` (Task 8) vía `supabase.rpc("create_business", { p_name: name })`. La forma de `getUserBusinesses()` (Task 10) coincide con el uso en `select-business/page.tsx` y en el layout.
