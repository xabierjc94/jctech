import Link from "next/link";
import type { IntegrationsStatus } from "@/lib/integrations";
import { formatShortDate, formatTime } from "@/lib/dates";
import { SubmitButton } from "@/components/submit-button";
import {
  desconectarGoogle,
  desconectarWhatsApp,
  guardarWhatsApp,
} from "./actions";

function Estado({ conectado }: { conectado: boolean }) {
  return (
    <span
      className={`rotulillo ${conectado ? "text-oliva" : "text-tinta-suave"}`}
    >
      {conectado ? "Conectado" : "Sin conectar"}
    </span>
  );
}

export function ConexionesTab({ status }: { status: IntegrationsStatus }) {
  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <div className="flex flex-col border border-tinta/20 p-5">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg">Google Calendar</h2>
          <Estado conectado={status.googleConnected} />
        </div>

        <p className="mb-4 flex-1 text-sm text-tinta-suave">
          El agente consulta tu calendario antes de proponer horas y crea ahí
          cada cita que reserva.
        </p>

        {status.googleConnected ? (
          <>
            <p className="mb-1 text-sm">{status.googleAccountEmail}</p>
            <p className="mb-4 text-sm text-tinta-suave">
              {status.googleSyncedAt
                ? `Última sincronización: ${formatShortDate(status.googleSyncedAt)} ${formatTime(status.googleSyncedAt)}`
                : "Sin sincronizar todavía."}
            </p>
            <form action={desconectarGoogle}>
              <SubmitButton
                pendingText="Desconectando…"
                className="border border-bermellon px-4 py-2 text-sm text-bermellon"
              >
                Desconectar
              </SubmitButton>
            </form>
          </>
        ) : (
          <Link
            href="/api/google/connect"
            className="self-start bg-tinta px-4 py-2 text-sm text-hueso"
          >
            Conectar Google Calendar
          </Link>
        )}
      </div>

      <div className="flex flex-col border border-tinta/20 p-5">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg">WhatsApp</h2>
          <Estado conectado={status.whatsappConnected} />
        </div>

        <p className="mb-4 text-sm text-tinta-suave">
          El número por el que tus clientes escriben y el agente responde.
        </p>

        {status.whatsappConnected ? (
          <>
            <p className="mb-1 text-sm">
              Número: {status.whatsappPhoneNumberId}
            </p>
            <p className="mb-4 text-sm text-tinta-suave">
              El token está guardado cifrado.
            </p>
            <form action={desconectarWhatsApp}>
              <SubmitButton
                pendingText="Desconectando…"
                className="border border-bermellon px-4 py-2 text-sm text-bermellon"
              >
                Desconectar
              </SubmitButton>
            </form>
          </>
        ) : (
          <form action={guardarWhatsApp} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="phone_number_id" className="rotulillo text-tinta-suave">
                Phone Number ID
              </label>
              <input
                id="phone_number_id"
                name="phone_number_id"
                type="text"
                required
                maxLength={40}
                placeholder="111222333444555"
                className="border border-tinta bg-hueso px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="access_token" className="rotulillo text-tinta-suave">
                Token de acceso permanente
              </label>
              <input
                id="access_token"
                name="access_token"
                type="password"
                required
                maxLength={500}
                placeholder="EAAG…"
                className="border border-tinta bg-hueso px-3 py-2 text-sm"
              />
            </div>

            <p className="text-sm text-tinta-suave">
              Los generas en Meta Business Suite, en la configuración de tu
              número de WhatsApp Business.
            </p>

            <SubmitButton
              pendingText="Guardando…"
              className="self-start bg-tinta px-4 py-2 text-sm text-hueso"
            >
              Conectar WhatsApp
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
