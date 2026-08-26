import { describe, expect, it } from "vitest";
import { findAvailableSlots } from "@/lib/agent/availability";
import type { BusinessHour } from "@/lib/business";

// 2026-06-15 es lunes. day_of_week 0 = lunes.
const mondayHours: BusinessHour[] = [
  { id: "h1", day_of_week: 0, start_time: "09:00:00", end_time: "11:00:00" },
];

// 09:00 en Madrid en junio (UTC+2) = 07:00 UTC.
const mondayMorning = new Date("2026-06-15T06:00:00Z");

describe("findAvailableSlots", () => {
  it("genera huecos dentro del horario, en hora de Madrid", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 60,
      from: mondayMorning,
      limit: 3,
    });

    expect(slots).toHaveLength(3);
    expect(slots[0].startsAt.toISOString()).toBe("2026-06-15T07:00:00.000Z");
    expect(slots[0].endsAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
    // Granularidad de 15 minutos.
    expect(slots[1].startsAt.toISOString()).toBe("2026-06-15T07:15:00.000Z");
  });

  it("no ofrece huecos que se salgan del cierre", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 60,
      from: mondayMorning,
      limit: 50,
      lookaheadDays: 1,
    });

    // En una ventana de 09:00 a 11:00, con 60 min de duración y pasos de 15,
    // caben 5 huecos: 09:00, 09:15, 09:30, 09:45 y 10:00.
    expect(slots).toHaveLength(5);

    const last = slots[slots.length - 1];
    // El último hueco de 60 min debe terminar justo a las 11:00 Madrid (09:00 UTC).
    expect(last.endsAt.toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("excluye los huecos que solapan con una cita existente", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [
        {
          starts_at: "2026-06-15T07:00:00.000Z",
          ends_at: "2026-06-15T08:00:00.000Z",
        },
      ],
      durationMinutes: 60,
      from: mondayMorning,
      limit: 1,
    });

    // Las 09:00 y las 09:15 Madrid solapan con la cita; el primer libre
    // empieza cuando la cita termina.
    expect(slots[0].startsAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });

  it("no ofrece huecos en el pasado", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 60,
      // 10:00 Madrid: las 09:00 ya han pasado.
      from: new Date("2026-06-15T08:00:00Z"),
      limit: 1,
    });

    expect(slots[0].startsAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });

  it("salta los días cerrados y encuentra el siguiente día abierto", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 60,
      // Martes: cerrado. El siguiente lunes es el 22 de junio.
      from: new Date("2026-06-16T06:00:00Z"),
      limit: 1,
    });

    expect(slots[0].startsAt.toISOString()).toBe("2026-06-22T07:00:00.000Z");
  });

  it("devuelve vacío si no hay horarios configurados", () => {
    const slots = findAvailableSlots({
      hours: [],
      busy: [],
      durationMinutes: 60,
      from: mondayMorning,
      limit: 5,
    });

    expect(slots).toHaveLength(0);
  });

  it("respeta el límite pedido", () => {
    const slots = findAvailableSlots({
      hours: mondayHours,
      busy: [],
      durationMinutes: 30,
      from: mondayMorning,
      limit: 2,
    });

    expect(slots).toHaveLength(2);
  });
});
