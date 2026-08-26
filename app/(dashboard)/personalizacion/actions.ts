"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TONES } from "./tones";

const MAX_BASE_PROMPT_LENGTH = 5000;

function fail(tab: string, message: string): never {
  redirect(`/personalizacion?tab=${tab}&error=${encodeURIComponent(message)}`);
}

function done(tab: string): never {
  revalidatePath("/personalizacion");
  redirect(`/personalizacion?tab=${tab}&ok=1`);
}

export async function saveGeneral(formData: FormData) {
  const tone = String(formData.get("tone"));
  const basePrompt = String(formData.get("base_prompt") ?? "").trim();
  const askNewPatient = formData.get("ask_new_patient") === "on";

  if (!TONES.includes(tone as (typeof TONES)[number])) {
    fail("general", "Selecciona un tono válido.");
  }

  if (basePrompt.length > MAX_BASE_PROMPT_LENGTH) {
    fail(
      "general",
      `El prompt base no puede superar ${MAX_BASE_PROMPT_LENGTH} caracteres.`
    );
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("general", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      tone,
      base_prompt: basePrompt,
      ask_new_patient: askNewPatient,
    })
    .eq("id", business.id);

  if (error) {
    fail("general", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("general");
}
