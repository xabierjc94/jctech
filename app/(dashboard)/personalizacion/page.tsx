import { Tabs, isTabId, type TabId } from "./tabs";
import { getActiveBusiness, getBusinessHours, getServices } from "@/lib/business";
import { GeneralTab } from "./general-tab";
import { NegocioTab } from "./negocio-tab";
import { HorariosTab } from "./horarios-tab";
import { ServiciosTab } from "./servicios-tab";

export default async function PersonalizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const active: TabId = isTabId(params.tab) ? params.tab : "general";
  const business = await getActiveBusiness();
  const hours = active === "horarios" ? await getBusinessHours() : [];
  const services = active === "servicios" ? await getServices() : [];

  return (
    <>
      <h1 className="mb-1 text-2xl">Personalización</h1>
      <p className="mb-6 text-tinta-suave">
        Configura cómo se comporta tu agente y qué sabe de tu negocio.
      </p>

      <Tabs active={active} />

      {params.error && (
        <p className="mb-4 rounded border border-bermellon px-3 py-2 text-sm text-bermellon">
          {params.error}
        </p>
      )}
      {params.ok && (
        <p className="mb-4 rounded border border-oliva px-3 py-2 text-sm text-oliva">
          Cambios guardados.
        </p>
      )}

      {active === "general" && <GeneralTab business={business} />}
      {active === "negocio" && <NegocioTab business={business} />}
      {active === "horarios" && <HorariosTab hours={hours} />}
      {active === "servicios" && <ServiciosTab services={services} />}
      {active === "mensajes" && (
        <p className="text-tinta-suave">Pestaña: {active}</p>
      )}
    </>
  );
}
