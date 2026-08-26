import { describe, expect, it } from "vitest";
import { todayRange, weekRange, daysAgo } from "@/lib/dates";

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
