import { SubmitButton } from "@/components/submit-button";
import { createBusiness } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl">Crea tu negocio</h1>
      <p className="text-tinta-suave">
        Este será el nombre que verás en el panel y en las conversaciones de
        WhatsApp.
      </p>

      {error && (
        <p className="rounded border border-bermellon px-3 py-2 text-sm text-bermellon">
          {error}
        </p>
      )}

      <form action={createBusiness} className="flex flex-col gap-3">
        <input
          name="name"
          type="text"
          placeholder="Nombre del negocio"
          required
          maxLength={100}
          className="border border-tinta bg-hueso px-3 py-2"
        />
        <SubmitButton
          className="bg-tinta px-4 py-2 text-hueso"
          pendingText="Creando…"
        >
          Crear negocio
        </SubmitButton>
      </form>
    </main>
  );
}
