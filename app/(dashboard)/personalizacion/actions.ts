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

const MAX_BUSINESS_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

export async function saveNegocio(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name || name.length > MAX_BUSINESS_NAME_LENGTH) {
    fail(
      "negocio",
      `El nombre debe tener entre 1 y ${MAX_BUSINESS_NAME_LENGTH} caracteres.`
    );
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    fail("negocio", `La dirección no puede superar ${MAX_ADDRESS_LENGTH} caracteres.`);
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    fail(
      "negocio",
      `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`
    );
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("negocio", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      email: email || null,
      address: address || null,
      description: description || null,
    })
    .eq("id", business.id);

  if (error) {
    fail("negocio", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("negocio");
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function addBusinessHour(formData: FormData) {
  const dayOfWeek = Number(formData.get("day_of_week"));
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    fail("horarios", "Selecciona un día válido.");
  }

  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    fail("horarios", "Introduce horas válidas en formato HH:MM.");
  }

  if (startTime >= endTime) {
    fail("horarios", "La hora de fin debe ser posterior a la de inicio.");
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("horarios", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase.from("business_hours").insert({
    business_id: business.id,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
  });

  if (error) {
    fail("horarios", "No se pudo guardar. Inténtalo de nuevo.");
  }

  done("horarios");
}

export async function deleteBusinessHour(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  if (!id) {
    fail("horarios", "No se pudo eliminar el rango.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("business_hours").delete().eq("id", id);

  if (error) {
    fail("horarios", "No se pudo eliminar el rango.");
  }

  done("horarios");
}

const MAX_SERVICE_NAME_LENGTH = 100;
const MAX_SERVICE_DESCRIPTION_LENGTH = 500;
const MAX_DURATION_MINUTES = 600;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function addService(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const durationMinutes = Number(formData.get("duration_minutes"));

  if (!name || name.length > MAX_SERVICE_NAME_LENGTH) {
    fail(
      "servicios",
      `El nombre debe tener entre 1 y ${MAX_SERVICE_NAME_LENGTH} caracteres.`
    );
  }

  if (description.length > MAX_SERVICE_DESCRIPTION_LENGTH) {
    fail(
      "servicios",
      `La descripción no puede superar ${MAX_SERVICE_DESCRIPTION_LENGTH} caracteres.`
    );
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes > MAX_DURATION_MINUTES
  ) {
    fail(
      "servicios",
      `La duración debe estar entre 1 y ${MAX_DURATION_MINUTES} minutos.`
    );
  }

  const slug = slugify(name);

  if (!slug) {
    fail("servicios", "El nombre debe contener al menos una letra o número.");
  }

  const supabase = await createClient();
  const { data: business, error: readError } = await supabase
    .from("businesses")
    .select("id")
    .limit(1)
    .single();

  if (readError || !business) {
    fail("servicios", "No se pudo guardar. Inténtalo de nuevo.");
  }

  const { error } = await supabase.from("services").insert({
    business_id: business.id,
    slug,
    name,
    description: description || null,
    duration_minutes: durationMinutes,
  });

  if (error) {
    fail(
      "servicios",
      error.code === "23505"
        ? "Ya existe un servicio con ese nombre."
        : "No se pudo guardar. Inténtalo de nuevo."
    );
  }

  done("servicios");
}

export async function deleteService(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  if (!id) {
    fail("servicios", "No se pudo eliminar el servicio.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", id);

  if (error) {
    fail("servicios", "No se pudo eliminar el servicio.");
  }

  done("servicios");
}
