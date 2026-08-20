"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MIN_PASSWORD_LENGTH = 8;

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent("Email o contraseña incorrectos.")}`);
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  if (password.length < MIN_PASSWORD_LENGTH) {
    redirect(
      `/login?error=${encodeURIComponent(
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
      )}`
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        "No se pudo crear la cuenta. Inténtalo de nuevo."
      )}`
    );
  }

  if (!data.session) {
    redirect(
      `/login?error=${encodeURIComponent(
        "Revisa tu email para confirmar la cuenta antes de entrar."
      )}`
    );
  }

  redirect("/onboarding");
}
