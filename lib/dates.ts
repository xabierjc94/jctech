export const TIME_ZONE = "Europe/Madrid";

const PART_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

function partsIn(instant: Date): Parts {
  const raw = Object.fromEntries(
    PART_FORMATTER.formatToParts(instant).map((p) => [p.type, p.value])
  );

  return {
    year: Number(raw.year),
    month: Number(raw.month),
    day: Number(raw.day),
    // Intl puede devolver "24" para medianoche; se normaliza a 0.
    hour: Number(raw.hour) % 24,
    minute: Number(raw.minute),
    weekday: raw.weekday,
  };
}

// Desplazamiento de la zona respecto a UTC, en minutos, para un instante dado.
function offsetMinutes(instant: Date): number {
  const p = partsIn(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return (asIfUtc - instant.getTime()) / 60000;
}

// Instante UTC correspondiente a las 00:00 en Madrid del día indicado.
function zonedMidnight(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = offsetMinutes(guess);
  const adjusted = new Date(guess.getTime() - offset * 60000);
  // Segunda pasada: cubre los días de cambio de hora, en los que el
  // desplazamiento del instante ajustado difiere del de la estimación.
  const secondOffset = offsetMinutes(adjusted);
  return secondOffset === offset
    ? adjusted
    : new Date(guess.getTime() - secondOffset * 60000);
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Inicio y fin (exclusivo) del día actual en Madrid, como instantes UTC. */
export function todayRange(now: Date = new Date()): { from: Date; to: Date } {
  const p = partsIn(now);
  const from = zonedMidnight(p.year, p.month, p.day);
  const to = zonedMidnight(p.year, p.month, p.day + 1);
  return { from, to };
}

/** Inicio (lunes) y fin (exclusivo) de la semana actual en Madrid. */
export function weekRange(now: Date = new Date()): { from: Date; to: Date } {
  const p = partsIn(now);
  const dayIndex = WEEKDAY_INDEX[p.weekday] ?? 0;
  const from = zonedMidnight(p.year, p.month, p.day - dayIndex);
  const to = zonedMidnight(p.year, p.month, p.day - dayIndex + 7);
  return { from, to };
}

/** Instante de hace `days` días, para ventanas móviles tipo "últimos 30 días". */
export function daysAgo(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Formatea una fecha ISO como hora local de Madrid (HH:MM). */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Formatea una fecha ISO como fecha corta de Madrid (p. ej. "27 may"). */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}
