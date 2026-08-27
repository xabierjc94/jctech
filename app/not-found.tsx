import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <span className="rotulillo text-tinta-suave">Error 404</span>
        <h1 className="mt-3 text-3xl">Esta página no existe</h1>
        <hr className="mt-5 w-10 border-0 border-t-2 border-bermellon" />
      </div>

      <p className="text-tinta-suave">
        Puede que el enlace esté mal o que la página se haya movido.
      </p>

      <Link
        href="/dashboard"
        className="self-start bg-tinta px-5 py-3 text-hueso hover:bg-tinta-suave"
      >
        Ir al panel
      </Link>
    </main>
  );
}
