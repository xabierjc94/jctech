import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl">Entrar al panel</h1>

      {error && (
        <p className="rounded border border-bermellon px-3 py-2 text-sm text-bermellon">
          {error}
        </p>
      )}

      <form className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="border border-tinta bg-hueso px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña"
          required
          minLength={8}
          className="border border-tinta bg-hueso px-3 py-2"
        />
        <div className="flex gap-2">
          <button
            formAction={signIn}
            className="flex-1 bg-tinta px-4 py-2 text-hueso"
          >
            Entrar
          </button>
          <button
            formAction={signUp}
            className="flex-1 border border-tinta px-4 py-2"
          >
            Crear cuenta
          </button>
        </div>
      </form>
    </main>
  );
}
