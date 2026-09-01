import { getIntegrationsStatus } from "@/lib/integrations";
import { createClient } from "@/lib/supabase/server";
import { getInvitations, getMyRole, getTeamMembers } from "@/lib/team";
import { ConexionesTab } from "./conexiones-tab";
import { EquipoTab } from "./equipo-tab";
import { Tabs, isTabId, type TabId } from "./tabs";

export default async function IntegracionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const active: TabId = isTabId(params.tab) ? params.tab : "conexiones";

  const status = await getIntegrationsStatus();

  const [members, invitations, myRole] =
    active === "equipo"
      ? await Promise.all([getTeamMembers(), getInvitations(), getMyRole()])
      : [[], [], null];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <h1 className="mb-1 text-2xl">Integraciones</h1>
      <p className="mb-6 text-tinta-suave">
        Conecta los servicios que el agente usa para operar y da acceso a tu
        equipo.
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

      {active === "conexiones" && <ConexionesTab status={status} />}
      {active === "equipo" && (
        <EquipoTab
          members={members}
          invitations={invitations}
          myRole={myRole}
          myUserId={user?.id ?? null}
        />
      )}
    </>
  );
}
