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
