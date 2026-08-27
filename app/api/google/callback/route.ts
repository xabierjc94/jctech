import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, fetchAccountEmail } from "@/lib/google/oauth";
import { saveGoogleConnection } from "@/lib/google/tokens";
import { GOOGLE_STATE_COOKIE } from "../connect/route";

function volver(mensaje?: string) {
  const url = new URL("/integraciones", process.env.NEXT_PUBLIC_SITE_URL);
  if (mensaje) url.searchParams.set("error", mensaje);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const store = await cookies();
  const expected = store.get(GOOGLE_STATE_COOKIE)?.value;
  store.delete(GOOGLE_STATE_COOKIE);

  // Sin esta comprobación, un tercero podría enlazar su calendario al negocio.
  if (!code || !state || !expected || state !== expected) {
    return volver("No se pudo verificar la respuesta de Google.");
  }

  const businessId = state.split(".")[1];

  if (!businessId) {
    return volver("No se pudo verificar la respuesta de Google.");
  }

  try {
    const tokens = await exchangeCode(code);

    if (!tokens.refreshToken) {
      return volver(
        "Google no devolvió permiso permanente. Revoca el acceso en tu cuenta y vuelve a conectar."
      );
    }

    const email = await fetchAccountEmail(tokens.accessToken);

    await saveGoogleConnection({
      businessId,
      refreshToken: tokens.refreshToken,
      accountEmail: email,
    });
  } catch {
    return volver("No se pudo conectar con Google. Inténtalo de nuevo.");
  }

  return volver();
}
