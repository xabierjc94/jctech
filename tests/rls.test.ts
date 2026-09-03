import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El proyecto de Supabase rechaza altas por signUp con dominios de prueba y
// aplica límite de tasa, así que los usuarios se crean con service_role. La
// consulta que se está verificando sigue haciéndose con el cliente anon
// autenticado como el usuario, que es el camino que recorre la app real.
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}@example.com`;
}

async function signUpAndCreateBusiness(email: string, businessName: string) {
  const password = "Test1234!";

  const { data: created, error: createError } = await admin.auth.admin.createUser(
    { email, password, email_confirm: true }
  );
  if (createError) throw createError;

  const client = createClient(url, anonKey);
  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: businessId, error: rpcError } = await client.rpc(
    "create_business",
    { p_name: businessName }
  );
  if (rpcError) throw rpcError;

  return {
    client,
    businessId: businessId as string,
    userId: created.user!.id,
  };
}

describe("aislamiento RLS entre negocios", () => {
  let a: Awaited<ReturnType<typeof signUpAndCreateBusiness>>;
  let b: Awaited<ReturnType<typeof signUpAndCreateBusiness>>;

  beforeAll(async () => {
    a = await signUpAndCreateBusiness(uniqueEmail("owner-a"), "Negocio A");
    b = await signUpAndCreateBusiness(uniqueEmail("owner-b"), "Negocio B");
  });

  afterAll(async () => {
    // Borrar el usuario solo arrastra su membresía: `businesses` no apunta al
    // usuario, así que el negocio hay que borrarlo aparte o queda huérfano.
    for (const user of [a, b]) {
      if (user?.businessId) {
        await admin.from("businesses").delete().eq("id", user.businessId);
      }
      if (user?.userId) await admin.auth.admin.deleteUser(user.userId);
    }
  });

  it("un usuario puede leer su propio negocio", async () => {
    const { data } = await a.client
      .from("businesses")
      .select("id")
      .eq("id", a.businessId);
    expect(data).toHaveLength(1);
  });

  it("un usuario no puede leer el negocio de otro usuario", async () => {
    const { data } = await a.client
      .from("businesses")
      .select("id")
      .eq("id", b.businessId);
    expect(data).toHaveLength(0);
  });
});
