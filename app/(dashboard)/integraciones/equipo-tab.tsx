import type { Invitation, TeamMember } from "@/lib/team";
import { formatShortDate } from "@/lib/dates";
import { SubmitButton } from "@/components/submit-button";
import { invitar, quitarMiembro, revocarInvitacion } from "./actions";

export function EquipoTab({
  members,
  invitations,
  myRole,
  myUserId,
}: {
  members: TeamMember[];
  invitations: Invitation[];
  myRole: "owner" | "empleado" | null;
  myUserId: string | null;
}) {
  const esOwner = myRole === "owner";

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h2 className="mb-3 text-lg">Miembros</h2>

        <div className="border border-tinta/20">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between border-b border-tinta/10 px-4 py-3 last:border-b-0"
            >
              <div>
                <p className="text-sm">
                  {member.email ?? "(sin email)"}
                  {member.user_id === myUserId && (
                    <span className="text-tinta-suave"> · tú</span>
                  )}
                </p>
                <p className="rotulillo text-tinta-suave">
                  {member.role === "owner" ? "Propietario" : "Empleado"}
                </p>
              </div>

              {esOwner && member.user_id !== myUserId && (
                <form action={quitarMiembro}>
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <SubmitButton
                    pendingText="Quitando…"
                    className="text-sm text-bermellon hover:underline"
                  >
                    Quitar
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg">Invitaciones pendientes</h2>

          <div className="border border-tinta/20">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between border-b border-tinta/10 px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm">{invitation.email}</p>
                  <p className="rotulillo text-tinta-suave">
                    Invitado el {formatShortDate(invitation.created_at)}
                  </p>
                </div>

                {esOwner && (
                  <form action={revocarInvitacion}>
                    <input type="hidden" name="id" value={invitation.id} />
                    <SubmitButton
                      pendingText="Revocando…"
                      className="text-sm text-bermellon hover:underline"
                    >
                      Revocar
                    </SubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {esOwner && (
        <div>
          <h2 className="mb-1 text-lg">Invitar a alguien</h2>
          <p className="mb-3 text-sm text-tinta-suave">
            Tendrá acceso al panel en cuanto entre con ese email. Avísale tú:
            no le enviamos ningún correo.
          </p>

          <form action={invitar} className="flex items-end gap-2">
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              placeholder="empleado@ejemplo.com"
              className="flex-1 border border-tinta bg-hueso px-3 py-2 text-sm"
            />
            <SubmitButton
              pendingText="Invitando…"
              className="bg-tinta px-4 py-2 text-sm text-hueso"
            >
              Invitar
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
