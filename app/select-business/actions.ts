"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/active-business";
import { getUserBusinesses } from "@/lib/business";

export async function selectBusiness(formData: FormData) {
  const businessId = String(formData.get("business_id") ?? "");

  // Solo se acepta un negocio del que el usuario sea miembro: la cookie no
  // debe poder apuntar a un negocio ajeno.
  const memberships = await getUserBusinesses();
  const allowed = memberships.some((m) => m.business_id === businessId);

  if (!allowed) {
    redirect("/select-business");
  }

  const store = await cookies();
  store.set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
