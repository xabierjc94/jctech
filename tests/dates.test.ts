import { describe, expect, it } from "vitest";
import {
  todayRange,
  weekRange,
  daysAgo,
  monthRange,
  daysInMonth,
  firstWeekdayOfMonth,
  dayOfMonth,
  monthName,
} from "@/lib/dates";

describe("todayRange", () => {
  it("usa el día de Madrid, no el de UTC, justo después de medianoche", () => {
    // 2026-06-15T22:30:00Z son las 00:30 del 16 de junio en Madrid (UTC+2).
    const { from, to } = todayRange(new Date("2026-06-15T22:30:00Z"));
    expect(from.toISOString()).toBe("2026-06-15T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-06-16T22:00:00.000Z");
  });

  it("aplica el desplazamiento de invierno (UTC+1)", () => {
    const { from, to } = todayRange(new Date("2026-01-15T12:00:00Z"));
    expect(from.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("cubre exactamente 24 horas en un día normal", () => {
    const { from, to } = todayRange(new Date("2026-06-15T12:00:00Z"));
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("weekRange", () => {
  it("empieza el lunes", () => {
    // 2026-06-17 es miércoles.
    const { from, to } = weekRange(new Date("2026-06-17T12:00:00Z"));
    // Lunes 15 de junio a las 00:00 en Madrid = 14 de junio 22:00 UTC.
    expect(from.toISOString()).toBe("2026-06-14T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-06-21T22:00:00.000Z");
  });

  it("trata el domingo como último día de la semana, no como el primero", () => {
    // 2026-06-21 es domingo: la semana debe seguir empezando el lunes 15.
    const { from } = weekRange(new Date("2026-06-21T12:00:00Z"));
    expect(from.toISOString()).toBe("2026-06-14T22:00:00.000Z");
  });

  it("cruza el cambio de mes sin romperse", () => {
    // 2026-07-01 es miércoles: la semana empieza el lunes 29 de junio.
    const { from } = weekRange(new Date("2026-07-01T12:00:00Z"));
    expect(from.toISOString()).toBe("2026-06-28T22:00:00.000Z");
  });
});

describe("daysAgo", () => {
  it("resta días naturales", () => {
    const result = daysAgo(30, new Date("2026-06-15T12:00:00Z"));
    expect(result.toISOString()).toBe("2026-05-16T12:00:00.000Z");
  });
});

describe("utilidades de mes", () => {
  it("monthRange cubre el mes entero en hora de Madrid", () => {
    // Junio de 2026: del 1 al 30. En verano Madrid es UTC+2.
    const { from, to } = monthRange(2026, 6);
    expect(from.toISOString()).toBe("2026-05-31T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("monthRange cruza el cambio de año", () => {
    const { from, to } = monthRange(2026, 12);
    // Diciembre es invierno: UTC+1.
    expect(from.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("daysInMonth conoce los meses cortos y los bisiestos", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("firstWeekdayOfMonth usa 0 = lunes", () => {
    // 1 de junio de 2026 es lunes.
    expect(firstWeekdayOfMonth(2026, 6)).toBe(0);
    // 1 de agosto de 2026 es sábado.
    expect(firstWeekdayOfMonth(2026, 8)).toBe(5);
  });

  it("dayOfMonth usa el día de Madrid, no el de UTC", () => {
    // 22:30 UTC del 15 de junio son las 00:30 del 16 en Madrid.
    expect(dayOfMonth(new Date("2026-06-15T22:30:00Z"))).toBe(16);
  });

  it("monthName devuelve el nombre en español", () => {
    expect(monthName(1)).toBe("Enero");
    expect(monthName(12)).toBe("Diciembre");
  });
});
