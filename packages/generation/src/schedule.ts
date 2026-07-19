/**
 * Schedule policies for recipes (roadmap §5.3 — "Podcast → 10 clips → schedule
 * M–F noon → hold for approval"). Pure date math so it's unit-testable.
 */

export interface WeekdayNoonPolicy {
  kind: "weekday_slots";
  /** Hour of day (0–23), local-naive UTC. */
  hour: number;
  /** Minute of hour. */
  minute: number;
}

export type SchedulePolicy = WeekdayNoonPolicy | { kind: "immediate" };

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Produce `count` publish times. For "weekday_slots", assign the next `count`
 * weekdays at the given time, starting the day AFTER `from` (so nothing is
 * scheduled in the past). "immediate" returns nulls (publish on approval).
 */
export function computeSchedule(
  policy: SchedulePolicy,
  count: number,
  from: Date,
): Array<Date | null> {
  if (policy.kind === "immediate") {
    return Array.from({ length: count }, () => null);
  }

  const slots: Date[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  while (slots.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWeekend(cursor)) continue;
    const slot = new Date(cursor);
    slot.setUTCHours(policy.hour, policy.minute, 0, 0);
    slots.push(slot);
  }
  return slots;
}
