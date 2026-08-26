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
