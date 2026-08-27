import Link from "next/link";
import { sendTestMessage } from "./actions";

type Turn = { role: "user" | "assistant"; text: string };

function parseHistory(raw: string | undefined): Turn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Turn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async function ProbarAgentePage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const params = await searchParams;
  const history = parseHistory(params.h);

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-2xl">Probar agente</h1>
          <p className="text-tinta-suave">
            Conversación de prueba. No se envía nada por WhatsApp ni se guardan
            citas reales.
          </p>
        </div>
        <Link href="/personalizacion" className="text-sm hover:underline">
          ← Volver
        </Link>
      </div>

      <div className="flex max-w-2xl flex-col gap-3">
        {history.length === 0 && (
          <p className="text-tinta-suave">
            Escribe un mensaje como si fueras un cliente.
          </p>
        )}

        {history.map((turn, index) => (
          <div
            key={index}
            className={
              turn.role === "user"
                ? "mr-auto max-w-[80%] rounded bg-hueso-hondo px-4 py-2"
                : "ml-auto max-w-[80%] rounded bg-oliva px-4 py-2 text-hueso"
            }
          >
            <p className="mb-1 text-xs opacity-70">
              {turn.role === "user" ? "Cliente" : "Agente IA"}
            </p>
            <p className="whitespace-pre-wrap">{turn.text}</p>
          </div>
        ))}

        <form action={sendTestMessage} className="mt-4 flex items-end gap-2">
          <input
            type="hidden"
            name="history"
            value={JSON.stringify(history)}
          />
          <textarea
            name="message"
            rows={2}
            required
            maxLength={1000}
            placeholder="Escribe como cliente…"
            className="flex-1 border border-tinta bg-hueso px-3 py-2"
          />
          <button type="submit" className="bg-tinta px-4 py-2 text-hueso">
            Enviar
          </button>
        </form>

        {history.length > 0 && (
          <Link
            href="/personalizacion/probar"
            className="self-start text-sm text-bermellon hover:underline"
          >
            Empezar de cero
          </Link>
        )}
      </div>
    </>
  );
}
