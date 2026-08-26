import { cookies } from "next/headers";

export const ACTIVE_BUSINESS_COOKIE = "jctech_business";

export async function readActiveBusinessId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_BUSINESS_COOKIE)?.value ?? null;
}
