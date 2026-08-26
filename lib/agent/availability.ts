import { zonedInstant, zonedParts } from "@/lib/dates";
import type { BusinessHour } from "@/lib/business";

export type Busy = { starts_at: string; ends_at: string };

export type Slot = { startsAt: Date; endsAt: Date };

/** Granularidad de los huecos ofrecidos, en minutos. */
export const SLOT_STEP_MINUTES = 15;

/** Días naturales que se exploran hacia delante como máximo. */
export const MAX_LOOKAHEAD_DAYS = 30;

function overlaps(slot: Slot, busy: Busy): boolean {
  const busyStart = new Date(busy.starts_at).getTime();
  const busyEnd = new Date(busy.ends_at).getTime();
  return slot.startsAt.getTime() < busyEnd && busyStart < slot.endsAt.getTime();
}

/**
 * Huecos libres para un servicio, respetando los horarios de atención y las
 * citas ya ocupadas. Todo el cálculo se hace en hora local de Madrid y se
 * devuelve en instantes UTC.
 */
export function findAvailableSlots({
  hours,
  busy,
  durationMinutes,
  from,
  limit,
  lookaheadDays = MAX_LOOKAHEAD_DAYS,
}: {
  hours: BusinessHour[];
  busy: Busy[];
  durationMinutes: number;
  from: Date;
  limit: number;
  lookaheadDays?: number;
}): Slot[] {
  const slots: Slot[] = [];
  const start = zonedParts(from);

  for (let offset = 0; offset < lookaheadDays && slots.length < limit; offset++) {
    // zonedInstant normaliza los desbordes de día, así que sumar es seguro.
    const dayInstant = zonedInstant(
      start.year,
      start.month,
      start.day + offset
    );
    const day = zonedParts(dayInstant);
    const dayHours = hours.filter((hour) => hour.day_of_week === day.dayOfWeek);

    for (const range of dayHours) {
      const [startHour, startMinute] = range.start_time.split(":").map(Number);
      const [endHour, endMinute] = range.end_time.split(":").map(Number);

      const rangeStart = zonedInstant(
        day.year,
        day.month,
        day.day,
        startHour,
        startMinute
      );
      const rangeEnd = zonedInstant(
        day.year,
        day.month,
        day.day,
        endHour,
        endMinute
      );

      for (
        let cursor = rangeStart.getTime();
        cursor + durationMinutes * 60000 <= rangeEnd.getTime();
        cursor += SLOT_STEP_MINUTES * 60000
      ) {
        if (slots.length >= limit) break;

        const slot: Slot = {
          startsAt: new Date(cursor),
          endsAt: new Date(cursor + durationMinutes * 60000),
        };

        if (slot.startsAt.getTime() < from.getTime()) continue;
        if (busy.some((entry) => overlaps(slot, entry))) continue;

        slots.push(slot);
      }
    }
  }

  return slots;
}
