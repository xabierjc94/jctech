import type { Appointment } from "@/lib/appointments";
import { dayOfMonth, daysInMonth, firstWeekdayOfMonth, formatTime } from "@/lib/dates";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function MonthGrid({
  year,
  month,
  appointments,
  today,
}: {
  year: number;
  month: number;
  appointments: Appointment[];
  today: number | null;
}) {
  const total = daysInMonth(year, month);
  const offset = firstWeekdayOfMonth(year, month);

  const byDay = new Map<number, Appointment[]>();
  for (const appointment of appointments) {
    const day = dayOfMonth(new Date(appointment.starts_at));
    byDay.set(day, [...(byDay.get(day) ?? []), appointment]);
  }

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div className="border border-tinta/20">
      <div className="grid grid-cols-7 border-b border-tinta/20">
        {WEEKDAYS.map((day) => (
          <div key={day} className="rotulillo px-3 py-2 text-tinta-suave">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, index) => (
          <div
            key={index}
            className={`min-h-24 border-b border-r border-tinta/10 p-2 ${
              day === today ? "bg-hueso-hondo" : ""
            }`}
          >
            {day && (
              <>
                <span
                  className={`text-sm ${
                    day === today ? "text-bermellon" : "text-tinta-suave"
                  }`}
                >
                  {day}
                </span>

                <div className="mt-1 flex flex-col gap-1">
                  {(byDay.get(day) ?? []).map((appointment) => (
                    <div
                      key={appointment.id}
                      title={`${appointment.contact_name ?? "Sin nombre"} · ${
                        appointment.source === "google"
                          ? "desde Google Calendar"
                          : "reservada por el agente"
                      }`}
                      className={`truncate px-1.5 py-0.5 text-xs ${
                        appointment.status === "cancelada"
                          ? "text-tinta-suave line-through"
                          : appointment.source === "google"
                            ? "bg-oliva/15 text-oliva"
                            : "bg-tinta text-hueso"
                      }`}
                    >
                      {formatTime(appointment.starts_at)}{" "}
                      {appointment.contact_name ?? "Sin nombre"}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
