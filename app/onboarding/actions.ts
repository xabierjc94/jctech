"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_BUSINESS_NAME_LENGTH = 100;

export async function createBusiness(formData: FormData) {
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name || name.length > MAX_BUSINESS_NAME_LENGTH) {
    redirect(
      `/onboarding?error=${encodeURIComponent(
        `El nombre del negocio debe tener entre 1 y ${MAX_BUSINESS_NAME_LENGTH} caracteres.`
      )}`
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("create_business", { p_name: name });

  if (error) {
    redirect(
      `/onboarding?error=${encodeURIComponent(
        "No se pudo crear el negocio. Inténtalo de nuevo."
      )}`
    );
  }

  redirect("/dashboard");
}
