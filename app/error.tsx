"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <span className="rotulillo text-tinta-suave">Algo ha fallado</span>
        <h1 className="mt-3 text-3xl">No hemos podido cargar la página</h1>
        <hr className="mt-5 w-10 border-0 border-t-2 border-bermellon" />
      </div>

      <p className="text-tinta-suave">
        Ha sido un fallo nuestro, no tuyo. Vuelve a intentarlo; si sigue
        pasando, escríbenos con el código de abajo.
      </p>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="bg-tinta px-5 py-3 text-hueso hover:bg-tinta-suave"
        >
          Reintentar
        </button>
        <Link
          href="/dashboard"
          className="border border-tinta/30 px-5 py-3 hover:border-tinta hover:bg-hueso-hondo"
        >
          Ir al panel
        </Link>
      </div>

      {error.digest && (
        <p className="rotulillo text-tinta-suave">Código {error.digest}</p>
      )}
    </main>
  );
}
