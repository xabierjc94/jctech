import type { BusinessHour } from "@/lib/business";
import { addBusinessHour, deleteBusinessHour } from "./actions";

const DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

// day_of_week: 0 = lunes ... 6 = domingo
export function HorariosTab({ hours }: { hours: BusinessHour[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {DAYS.map((day, index) => {
        const dayHours = hours.filter((hour) => hour.day_of_week === index);

        return (
          <div key={day} className="flex flex-col gap-2">
            <p className="text-sm">{day}</p>

            {dayHours.length === 0 && (
              <p className="text-sm text-tinta-suave">Cerrado</p>
            )}

            {dayHours.map((hour) => (
              <div key={hour.id} className="flex items-center gap-3">
                <span className="tabular-nums">
                  {hour.start_time.slice(0, 5)} a {hour.end_time.slice(0, 5)}
                </span>
                <form action={deleteBusinessHour}>
                  <input type="hidden" name="id" value={hour.id} />
                  <button
                    type="submit"
                    className="text-sm text-bermellon hover:underline"
                  >
                    Eliminar
                  </button>
                </form>
              </div>
            ))}

            <form action={addBusinessHour} className="flex items-center gap-2">
              <input type="hidden" name="day_of_week" value={index} />
              <input
                name="start_time"
                type="time"
                required
                defaultValue="09:00"
                className="border border-tinta bg-hueso px-2 py-1"
              />
              <span className="text-sm text-tinta-suave">a</span>
              <input
                name="end_time"
                type="time"
                required
                defaultValue="18:00"
                className="border border-tinta bg-hueso px-2 py-1"
              />
              <button
                type="submit"
                className="border border-tinta px-3 py-1 text-sm"
              >
                Agregar rango
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
