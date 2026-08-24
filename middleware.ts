import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Debe reflejar el mismo conjunto de rutas que config.matcher más abajo —
  // Next.js evalúa matcher antes de ejecutar esta función, así que una ruta
  // añadida aquí sin añadirla también a matcher quedaría sin proteger.
  const isProtected =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/onboarding") ||
    request.nextUrl.pathname.startsWith("/conversaciones") ||
    request.nextUrl.pathname.startsWith("/citas") ||
    request.nextUrl.pathname.startsWith("/personalizacion") ||
    request.nextUrl.pathname.startsWith("/integraciones") ||
    request.nextUrl.pathname.startsWith("/select-business");

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Debe reflejar el mismo conjunto de rutas que isProtected más arriba.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding",
    "/conversaciones/:path*",
    "/citas/:path*",
    "/personalizacion/:path*",
    "/integraciones/:path*",
    "/select-business",
  ],
};
