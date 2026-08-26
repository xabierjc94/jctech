import Link from "next/link";
import { getDashboardMetrics } from "@/lib/metrics";
import { getConversations } from "@/lib/conversations";
import { formatShortDate, formatTime } from "@/lib/dates";
import { MetricCard } from "./metric-card";

export default async function DashboardPage() {
  const [metrics, conversations] = await Promise.all([
    getDashboardMetrics(),
    getConversations(5),
  ]);

  return (
    <>
      <h1 className="mb-1 text-2xl">Dashboard</h1>
      <p className="mb-6 text-tinta-suave">
        Resumen de actividad reciente de tu negocio.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Conversaciones 30D"
          value={metrics.conversations30d}
          hint="Últimos 30 días"
        />
        <MetricCard
          label="Citas esta semana"
          value={metrics.appointmentsThisWeek}
          hint="Lunes a domingo"
        />
        <MetricCard
          label="Citas hoy"
          value={metrics.appointmentsToday}
          hint="Confirmadas para hoy"
        />
        <MetricCard
          label="Bot en pausa"
          value={metrics.pausedBots}
          hint="Conversaciones con atención humana"
        />
      </div>

      <div className="border border-tinta/20">
        <div className="flex items-center justify-between border-b border-tinta/20 px-5 py-3">
          <h2 className="text-lg">Últimas conversaciones</h2>
          <Link href="/conversaciones" className="text-sm hover:underline">
            Ver todas →
          </Link>
        </div>

        {conversations.length === 0 && (
          <p className="px-5 py-6 text-tinta-suave">
            Todavía no hay conversaciones.
          </p>
        )}

        {conversations.map((conversation) => (
          <Link
            key={conversation.id}
            href={`/conversaciones?c=${conversation.id}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-hueso-hondo"
          >
            <span>{conversation.contact_name ?? conversation.contact_phone}</span>
            <span className="text-sm text-tinta-suave">
              {formatShortDate(conversation.last_message_at)}{" "}
              {formatTime(conversation.last_message_at)}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
