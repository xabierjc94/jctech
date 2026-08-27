import { beforeAll, describe, expect, it } from "vitest";
import { buildAuthUrl, googleRedirectUri } from "@/lib/google/oauth";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3005";
  process.env.GOOGLE_CLIENT_ID = "id-de-prueba";
});

describe("googleRedirectUri", () => {
  it("compone la ruta del callback", () => {
    expect(googleRedirectUri()).toBe("http://localhost:3005/api/google/callback");
  });

  it("no duplica la barra final", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3005/";
    expect(googleRedirectUri()).toBe("http://localhost:3005/api/google/callback");
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3005";
  });
});

describe("buildAuthUrl", () => {
  it("pide permiso permanente, sin el cual no hay refresh token", () => {
    const url = new URL(buildAuthUrl("estado-de-prueba"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("pide solo el ámbito de calendario y el correo", () => {
    const url = new URL(buildAuthUrl("estado-de-prueba"));
    const scopes = (url.searchParams.get("scope") ?? "").split(" ");
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar");
    expect(scopes).toContain("https://www.googleapis.com/auth/userinfo.email");
    expect(scopes).toHaveLength(2);
  });

  it("propaga el state y el redirect_uri", () => {
    const url = new URL(buildAuthUrl("estado-de-prueba"));
    expect(url.searchParams.get("state")).toBe("estado-de-prueba");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3005/api/google/callback"
    );
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("apunta al endpoint de autorización de Google", () => {
    const url = new URL(buildAuthUrl("x"));
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
  });
});
