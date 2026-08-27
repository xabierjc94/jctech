import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google/oauth";
import { getActiveBusinessId } from "@/lib/business";

export const GOOGLE_STATE_COOKIE = "jctech_google_state";

export async function GET() {
  const businessId = await getActiveBusinessId();

  if (!businessId) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  // El state ata la respuesta de Google a esta petición y a este negocio.
  const state = `${crypto.randomBytes(16).toString("hex")}.${businessId}`;

  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
