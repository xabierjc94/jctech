import { redirect } from "next/navigation";

// La raíz no tiene contenido propio: el panel vive bajo /dashboard, que a su
// vez redirige a /login o a /onboarding según el estado del usuario.
export default function Home() {
  redirect("/dashboard");
}
