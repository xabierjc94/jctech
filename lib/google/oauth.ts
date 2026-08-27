const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Solo el ámbito de calendario: nada de correo ni contactos. */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function googleRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;

  if (!base) {
    throw new Error("Falta NEXT_PUBLIC_SITE_URL");
  }

  return `${base.replace(/\/$/, "")}/api/google/callback`;
}

/**
 * URL a la que se manda al usuario para que autorice. `state` viaja de ida y
 * vuelta y sirve para comprobar que la respuesta es de una petición nuestra.
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    // Sin estos dos, Google no devuelve refresh_token en la segunda
    // autorización de la misma cuenta.
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${AUTH_URL}?${params.toString()}`;
}

export type TokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
};

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Google rechazó la petición de token (${response.status})`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresInSeconds: data.expires_in,
  };
}

/** Canjea el código de la redirección por tokens. */
export function exchangeCode(code: string): Promise<TokenResponse> {
  return requestToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: googleRedirectUri(),
  });
}

/** Obtiene un access token nuevo a partir del refresh token guardado. */
export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return requestToken({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/** Correo de la cuenta autorizada, para mostrarlo en Integraciones. */
export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as { email?: string };
  return data.email ?? null;
}
