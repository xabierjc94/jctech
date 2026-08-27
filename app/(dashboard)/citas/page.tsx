import Link from "next/link";
import { getActiveBusinessId } from "@/lib/business";
import { getMonthAppointments } from "@/lib/appointments";
import { currentMonth, dayOfMonth, monthName } from "@/lib/dates";
import { syncFromGoogle } from "@/lib/google/sync";
import { MonthGrid } from "./month-grid";

export default async function CitasPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const params = await searchParams;
  const actual = currentMonth();

  const year = Number(params.y) || actual.year;
  const month = Math.min(Math.max(Number(params.m) || actual.month, 1), 12);

  // Se traen los cambios hechos directamente en Google antes de pintar.
  const businessId = await getActiveBusinessId();
  if (businessId) {
    await syncFromGoogle(businessId);
  }

  const appointments = await getMonthAppointments(year, month);

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const esMesActual = year === actual.year && month === actual.month;
  const hoy = esMesActual ? dayOfMonth(new Date()) : null;

  const confirmadas = appointments.filter((a) => a.status !== "cancelada");

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="mb-1 text-2xl">
            {monthName(month)} {year}
          </h1>
          <p className="text-tinta-suave">
            {confirmadas.length === 0
              ? "Ninguna cita este mes."
              : `${confirmadas.length} cita${confirmadas.length === 1 ? "" : "s"} este mes.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/citas?y=${prev.y}&m=${prev.m}`}
            className="border border-tinta/30 px-3 py-1.5 text-sm hover:border-tinta"
          >
            ←
          </Link>
          <Link
            href="/citas"
            className="border border-tinta/30 px-3 py-1.5 text-sm hover:border-tinta"
          >
            Hoy
          </Link>
          <Link
            href={`/citas?y=${next.y}&m=${next.m}`}
            className="border border-tinta/30 px-3 py-1.5 text-sm hover:border-tinta"
          >
            →
          </Link>
        </div>
      </div>

      <MonthGrid
        year={year}
        month={month}
        appointments={appointments}
        today={hoy}
      />

      <div className="mt-4 flex gap-5 text-sm text-tinta-suave">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-tinta" />
          Reservada por el agente
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-oliva/40" />
          Desde Google Calendar
        </span>
      </div>
    </>
  );
}
