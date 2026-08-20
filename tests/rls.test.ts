import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

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
  // TODO: no hay limpieza (afterAll) — cada ejecución deja usuarios de auth
  // y filas de businesses permanentes en la base local. Aceptable mientras
  // sea una suite pequeña contra Supabase local, pero añadir limpieza antes
  // de que esta suite crezca o se apunte a una base compartida/CI.
  let a: Awaited<ReturnType<typeof signUpAndCreateBusiness>>;
  let b: Awaited<ReturnType<typeof signUpAndCreateBusiness>>;

  beforeAll(async () => {
    a = await signUpAndCreateBusiness(uniqueEmail("owner-a"), "Negocio A");
    b = await signUpAndCreateBusiness(uniqueEmail("owner-b"), "Negocio B");
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
