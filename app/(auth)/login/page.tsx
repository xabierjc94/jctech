import { SubmitButton } from "@/components/submit-button";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const year = new Date().getFullYear();

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1fr_1.15fr]">
      {/* Columna de marca. En móvil se reduce a una cabecera. */}
      <aside className="grano relative flex flex-col justify-between overflow-hidden bg-tinta px-8 py-10 text-hueso lg:px-14 lg:py-14">
        <div className="entra flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center bg-hueso text-sm font-semibold text-tinta">
            JC
          </span>
          <span className="text-lg">JC Tech</span>
        </div>

        <div className="entra retardo-1 hidden max-w-md lg:block">
          <span className="rotulillo text-hueso/50">Panel de control</span>
          <p className="mt-5 font-display text-4xl leading-[1.15]">
            Tu agente responde,
            <br />
            agenda y no pierde
            <br />
            <span className="text-bermellon">ni una cita.</span>
          </p>
          <hr className="mt-7 w-16 border-0 border-t-2 border-bermellon" />
          <p className="mt-6 text-hueso/60">
            Conversaciones de WhatsApp, citas y comportamiento del agente, en un
            solo sitio.
          </p>
        </div>

        <p className="rotulillo entra retardo-2 hidden text-hueso/35 lg:block">
          {year} · Javier Castillo
        </p>
      </aside>

      {/* Columna del formulario. */}
      <section className="flex items-center justify-center px-6 py-16 lg:px-14">
        <div className="w-full max-w-sm">
          <div className="entra">
            <span className="rotulillo text-tinta-suave">Acceso</span>
            <h1 className="mt-3 text-3xl">Entrar al panel</h1>
            <hr className="mt-5 w-10 border-0 border-t-2 border-bermellon" />
          </div>

          {error && (
            <p
              role="alert"
              className="entra mt-7 border-l-2 border-bermellon bg-bermellon/5 py-3 pl-4 pr-3 text-sm text-bermellon"
            >
              {error}
            </p>
          )}

          <form className="entra retardo-1 mt-9 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="rotulillo text-tinta-suave">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@negocio.com"
                className="border-0 border-b border-tinta/25 bg-transparent pb-2 text-lg placeholder:text-tinta/25 focus:border-tinta focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="rotulillo text-tinta-suave">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
                placeholder="Mínimo 8 caracteres"
                className="border-0 border-b border-tinta/25 bg-transparent pb-2 text-lg placeholder:text-tinta/25 focus:border-tinta focus:outline-none"
              />
            </div>

            <div className="mt-2 flex flex-col gap-3">
              <SubmitButton
                formAction={signIn}
                pendingText="Entrando…"
                className="bg-tinta px-5 py-3 text-hueso hover:bg-tinta-suave"
              >
                Entrar
              </SubmitButton>

              <SubmitButton
                formAction={signUp}
                pendingText="Creando cuenta…"
                className="border border-tinta/30 px-5 py-3 hover:border-tinta hover:bg-hueso-hondo"
              >
                Crear cuenta
              </SubmitButton>
            </div>
          </form>

          <p className="entra retardo-2 mt-8 text-sm text-tinta-suave">
            ¿Primera vez? Crea la cuenta y te guiamos para dar de alta tu
            negocio.
          </p>
        </div>
      </section>
    </main>
  );
}
