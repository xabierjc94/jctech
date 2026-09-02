import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBusy, listEvents } from "@/lib/google/calendar";

const original = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = original;
});

function responderCon(payload: unknown, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

const args = {
  accessToken: "token",
  calendarId: "primary",
  from: new Date("2026-06-15T00:00:00Z"),
  to: new Date("2026-06-16T00:00:00Z"),
};

describe("fetchBusy", () => {
  it("convierte las franjas de Google al formato de disponibilidad", async () => {
    responderCon({
      calendars: {
        primary: {
          busy: [{ start: "2026-06-15T09:00:00Z", end: "2026-06-15T10:00:00Z" }],
        },
      },
    });

    await expect(fetchBusy(args)).resolves.toEqual([
      { starts_at: "2026-06-15T09:00:00Z", ends_at: "2026-06-15T10:00:00Z" },
    ]);
  });

  it("devuelve vacío si el calendario no trae franjas", async () => {
    responderCon({ calendars: { primary: {} } });
    await expect(fetchBusy(args)).resolves.toEqual([]);
  });

  it("devuelve vacío si el calendario no aparece en la respuesta", async () => {
    responderCon({ calendars: {} });
    await expect(fetchBusy(args)).resolves.toEqual([]);
  });

  it("lanza si Google responde con error", async () => {
    responderCon({}, false, 401);
    await expect(fetchBusy(args)).rejects.toThrow("401");
  });
});

describe("listEvents", () => {
  it("ignora los eventos de día completo, que no son citas con hora", async () => {
    responderCon({
      items: [
        {
          id: "con-hora",
          summary: "Cita",
          start: { dateTime: "2026-06-15T09:00:00Z" },
          end: { dateTime: "2026-06-15T10:00:00Z" },
        },
        {
          id: "dia-completo",
          summary: "Vacaciones",
          start: { date: "2026-06-15" },
          end: { date: "2026-06-16" },
        },
      ],
    });

    const eventos = await listEvents(args);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].id).toBe("con-hora");
  });

  it("marca los eventos cancelados", async () => {
    responderCon({
      items: [
        {
          id: "cancelado",
          status: "cancelled",
          summary: "Cita anulada",
          start: { dateTime: "2026-06-15T09:00:00Z" },
          end: { dateTime: "2026-06-15T10:00:00Z" },
        },
      ],
    });

    const eventos = await listEvents(args);
    expect(eventos[0].cancelled).toBe(true);
  });

  it("pide a Google que incluya los borrados, o nunca llegarían cancelados", async () => {
    responderCon({});
    await listEvents(args);

    const [url] = (globalThis.fetch as unknown as { mock: { calls: [string][] } })
      .mock.calls[0];
    expect(new URL(url).searchParams.get("showDeleted")).toBe("true");
  });

  it("acepta eventos sin título", async () => {
    responderCon({
      items: [
        {
          id: "sin-titulo",
          start: { dateTime: "2026-06-15T09:00:00Z" },
          end: { dateTime: "2026-06-15T10:00:00Z" },
        },
      ],
    });

    const eventos = await listEvents(args);
    expect(eventos[0].summary).toBeNull();
  });

  it("devuelve vacío si no hay eventos", async () => {
    responderCon({});
    await expect(listEvents(args)).resolves.toEqual([]);
  });
});
