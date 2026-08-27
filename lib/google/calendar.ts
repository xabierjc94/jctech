import { TIME_ZONE } from "@/lib/dates";

const API = "https://www.googleapis.com/calendar/v3";

export type BusyPeriod = { starts_at: string; ends_at: string };

export type CalendarEvent = {
  id: string;
  summary: string | null;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
};

/** Franjas ocupadas del calendario entre dos instantes. */
export async function fetchBusy({
  accessToken,
  calendarId,
  from,
  to,
}: {
  accessToken: string;
  calendarId: string;
  from: Date;
  to: Date;
}): Promise<BusyPeriod[]> {
  const response = await fetch(`${API}/freeBusy`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar rechazó freeBusy (${response.status})`);
  }

  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };

  const busy = data.calendars?.[calendarId]?.busy ?? [];

  return busy.map((b) => ({ starts_at: b.start, ends_at: b.end }));
}

/** Crea un evento y devuelve su id de Google. */
export async function createEvent({
  accessToken,
  calendarId,
  summary,
  description,
  startsAt,
  endsAt,
}: {
  accessToken: string;
  calendarId: string;
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<string> {
  const response = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: startsAt.toISOString(), timeZone: TIME_ZONE },
        end: { dateTime: endsAt.toISOString(), timeZone: TIME_ZONE },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar rechazó el evento (${response.status})`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/** Eventos del calendario en una ventana, para sincronizarlos al panel. */
export async function listEvents({
  accessToken,
  calendarId,
  from,
  to,
}: {
  accessToken: string;
  calendarId: string;
  from: Date;
  to: Date;
}): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const response = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar rechazó la lista (${response.status})`);
  }

  const data = (await response.json()) as {
    items?: {
      id: string;
      status?: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }[];
  };

  return (data.items ?? [])
    // Los eventos de día completo traen `date` en vez de `dateTime`: no son
    // citas con hora, así que se ignoran.
    .filter((item) => item.start?.dateTime && item.end?.dateTime)
    .map((item) => ({
      id: item.id,
      summary: item.summary ?? null,
      startsAt: item.start!.dateTime!,
      endsAt: item.end!.dateTime!,
      cancelled: item.status === "cancelled",
    }));
}
