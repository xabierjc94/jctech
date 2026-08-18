# Panel de gestión de clientes (AILINK) — Diseño

Fecha: 2026-08-18

## Contexto y objetivo

Panel web para que un negocio local (cliente de una agencia de agentes IA) gestione su
agente de WhatsApp: conversaciones, citas, personalización del comportamiento del
agente e integraciones (WhatsApp Cloud API, Google Calendar). Inspirado en las
capturas de un producto de demo ("AILINK") con 5 secciones: Dashboard, Conversaciones,
Citas, Personalización e Integraciones.

Este es un proyecto nuevo, independiente de `jctech-landing` (que es la landing
estática en Astro). Vive en el repo `jctech`.

## Alcance de esta fase

Producto funcional completo: UI + base de datos + auth + agente IA respondiendo por
WhatsApp real (Cloud API de Meta) + sincronización con Google Calendar. No incluye
automatizar el alta/verificación de la cuenta de WhatsApp Business ante Meta (eso lo
hace el negocio manualmente, fuera del panel).

## 1. Stack y estructura del proyecto

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS**
- **Supabase**: Auth + Postgres (con RLS) como backend
- **Anthropic Claude API** para el agente conversacional
- **Google Calendar API** (OAuth2) para disponibilidad y citas
- **WhatsApp Cloud API** (Meta) para mensajería
- Despliegue: **Vercel**

```
jctech/
  app/
    (auth)/login/            # login del negocio
    (dashboard)/
      dashboard/
      conversaciones/
      citas/
      personalizacion/
      integraciones/
    api/
      whatsapp/webhook/      # recibe mensajes de Meta
      google/oauth/callback/ # conecta Google Calendar
  lib/
    supabase/                # clientes server/browser
    claude/                  # llamada al agente + tools
    google-calendar/
    whatsapp/                # envío de mensajes vía Cloud API
  supabase/migrations/
```

## 2. Modelo de datos (Supabase/Postgres)

Todas las tablas de negocio llevan `business_id` y usan RLS vía la tabla
`business_members` (ver sección 3).

- **businesses** — nombre, email, tono, prompt base, `google_calendar_connected`,
  `whatsapp_connected`
- **business_members** — `business_id`, `user_id`, `role` (`owner` / `empleado`).
  Relación muchos-a-muchos entre usuarios de Supabase Auth y negocios.
- **business_hours** — negocio, día de la semana, rangos horarios (varios rangos por
  día)
- **services** — negocio, nombre, descripción, duración (min), id interno (slug)
- **conversations** — negocio, contacto (nombre/teléfono WhatsApp), `bot_active`
  (bool), `last_message_at`
- **messages** — conversación, remitente (`cliente` / `agente_ia` / `humano`), texto,
  timestamp
- **message_templates** — negocio, mensajes personalizables (saludo, fuera de
  horario, confirmación, etc.)
- **appointments** — negocio, `google_event_id`, cliente, servicio, fecha/hora,
  estado (confirmada/cancelada/completada). Es una **copia local sincronizada** de
  los eventos de Google Calendar: se escribe cuando el agente agenda una cita y se
  refresca periódicamente para reflejar cambios hechos directamente en Google
  Calendar.

**Fuente de verdad de disponibilidad y citas: Google Calendar.** La tabla
`appointments` es una copia de lectura rápida para el Dashboard y la vista de Citas;
las comprobaciones de huecos libres al agendar consultan Google Calendar en tiempo
real.

## 3. Autenticación y multi-tenant

- Supabase Auth (email/password).
- Un negocio puede tener **varios usuarios/empleados** desde el inicio, vía
  `business_members` (`owner` / `empleado`, mismo nivel de acceso funcional por
  ahora — el rol queda preparado para restricciones futuras).
- El primer usuario que crea un negocio queda como `owner`; puede invitar más
  usuarios por email desde la pestaña "Equipo" (dentro de Integraciones).
- Si un usuario pertenece a un solo negocio, entra directo a su dashboard. Si
  pertenece a varios, se le muestra un selector de negocio antes de entrar.
- RLS en todas las tablas con `business_id`: acceso solo si el usuario aparece en
  `business_members` para ese `business_id`.

## 4. Páginas del panel

Sidebar fijo: Dashboard · Conversaciones · Citas · Personalización · Integraciones.
Cabecera con nombre del negocio (o selector si el usuario tiene varios) y email del
usuario.

- **Dashboard** — 4 tarjetas (Conversaciones 30D, Citas esta semana, Citas hoy, Bot
  en pausa) + lista de "Últimas conversaciones". Calculado desde `messages` /
  `conversations` / `appointments`.
- **Conversaciones** — lista de conversaciones a la izquierda (contacto, último
  mensaje, hora), chat a la derecha con burbujas por remitente y toggle **"Bot
  activo"** por conversación. Escribir como humano en el chat envía el mensaje por
  WhatsApp y pausa el bot automáticamente para esa conversación.
- **Citas** — calendario mensual con citas como chips por día, navegación mes
  anterior/siguiente y "Hoy". Click en una cita muestra el detalle (servicio,
  cliente, hora).
- **Personalización** — pestañas:
  - *General*: identidad del agente (tono: profesional y cálido / formal / cercano y
    casual / directo), prompt base editable, toggles de comportamiento (ej.
    "preguntar si es paciente nuevo al agendar").
  - *Negocio*: nombre, dirección, descripción del negocio.
  - *Horarios*: rangos por día de la semana, varios rangos por día ("+ Agregar
    rango").
  - *Servicios*: lista editable (nombre, duración, descripción, id interno).
  - *Mensajes*: plantillas (saludo, fuera de horario, confirmación, etc.).
  - Botones "Probar agente" (chat de prueba, no toca WhatsApp/Google Calendar
    reales) y "Guardar".
- **Integraciones** — tarjetas de estado para WhatsApp Cloud API y Google Calendar
  (Conectado / Conectar / Desconectar), más una pestaña **Equipo** (miembros del
  negocio + invitar por email).

## 5. Agente de IA (WhatsApp + Claude)

Flujo de un mensaje entrante:

1. Meta envía el mensaje al webhook `/api/whatsapp/webhook`.
2. Se busca/crea la `conversation` por número de teléfono y se guarda el `message`
   (remitente: cliente).
3. Si `bot_active = true` para esa conversación, se llama a la API de Claude con:
   - El prompt base de Personalización → General, con la info del negocio,
     servicios y horarios inyectada dinámicamente.
   - El historial reciente de la conversación.
   - Tools: `consultar_disponibilidad` (consulta Google Calendar del negocio),
     `agendar_cita` (crea evento en Google Calendar + guarda copia en
     `appointments`), `transferir_a_humano` (pone `bot_active = false`).
4. La respuesta se envía por WhatsApp Cloud API y se guarda como `message`
   (remitente: agente_ia).
5. Si Claude invoca `transferir_a_humano` (tras no entender 2 veces, o petición
   explícita del cliente), la conversación pasa a manual automáticamente.

**Traspaso manual**: el toggle "Bot activo" en Conversaciones fuerza `bot_active` a
`true`/`false` en cualquier momento, independientemente de lo que decida el agente.

**"Probar agente"**: misma lógica de Claude + tools en una conversación aislada, con
un calendario simulado en memoria (no toca WhatsApp ni Google Calendar reales).

## 6. Integraciones

- **Google Calendar**: OAuth2 estándar desde Integraciones. El `refresh_token` se
  guarda cifrado en Supabase. Se usa para leer huecos libres y crear eventos.
- **WhatsApp Cloud API**: el negocio introduce Phone Number ID y token de acceso
  permanente (generados manualmente en Meta Business Suite). Credenciales
  guardadas cifradas en `businesses`. El panel registra el webhook para ese número.
- Fuera de alcance: automatizar el alta/verificación de la cuenta de WhatsApp
  Business ante Meta.

## 7. Testing y despliegue

- Despliegue en Vercel; variables de entorno para Supabase, Anthropic, Google OAuth
  y clave de cifrado de credenciales.
- Migraciones de Supabase versionadas en `supabase/migrations/`.
- Tests unitarios (Vitest) para la lógica del agente: construcción del prompt y
  parseo/ejecución de tools.
- Sin e2e automatizado en esta fase; verificación manual vía "Probar agente" y,
  más adelante, con un número de WhatsApp de pruebas de Meta.
