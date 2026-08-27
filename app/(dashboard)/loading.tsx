// Se muestra al instante al navegar entre secciones, mientras el servidor
// resuelve los datos. Sin esto la interfaz se queda congelada en la página
// anterior y la navegación se percibe lenta aunque tarde lo mismo.
function Barra({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-tinta/10 ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      <Barra className="h-7 w-48" />
      <Barra className="mt-3 h-4 w-72" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border border-tinta/20 px-5 py-4">
            <Barra className="h-3 w-24" />
            <Barra className="mt-3 h-9 w-14" />
            <Barra className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="mt-8 border border-tinta/20">
        <div className="border-b border-tinta/20 px-5 py-4">
          <Barra className="h-5 w-44" />
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between px-5 py-4"
          >
            <Barra className="h-4 w-40" />
            <Barra className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
