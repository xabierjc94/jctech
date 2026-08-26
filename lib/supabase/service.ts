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
