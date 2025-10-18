import { useEffect, useState } from "react";
import { getEvents } from "../api";

export type Suggestion = { startISO: string; endISO: string; reason: string };

function toISO(d: Date) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Build free slots inside [rangeStart, rangeEnd] from existing events.
 * - durationMin: the block length to propose (default 60)
 * - dayStart/dayEnd: local “working hours” window per day (defaults 06:00–23:00 to be generous)
 */
export function useSuggestions(
  rangeStart: Date,
  rangeEnd: Date,
  opts?: { durationMin?: number; dayStartHour?: number; dayEndHour?: number }
) {
  const durationMin = opts?.durationMin ?? 60;
  const dayStartHour = opts?.dayStartHour ?? 6;
  const dayEndHour = opts?.dayEndHour ?? 23;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) Fetch events for the visible range
        const res: any = await getEvents(toISO(rangeStart), toISO(rangeEnd));
        const list: any[] = Array.isArray(res) ? res : (res?.events ?? []);

        // 2) Bucket events by local day
        const byDay = new Map<string, { s: number; e: number }[]>();
        const dayKey = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD in UTC; good enough for bucketing

        for (const ev of list) {
          const s = new Date(ev.startISO);
          const e = new Date(ev.endISO);
          const key = dayKey(s);
          if (!byDay.has(key)) byDay.set(key, []);
          byDay.get(key)!.push({ s: s.getTime(), e: e.getTime() });
        }

        // 3) For each day in [rangeStart, rangeEnd), compute free intervals
        const out: Suggestion[] = [];
        const now = Date.now() + 10 * 60 * 1000; // future-only with a 10-min buffer

        for (
          let d = new Date(rangeStart);
          d < rangeEnd;
          d = new Date(d.getTime() + 24 * 3600 * 1000)
        ) {
          const dayStart = new Date(d);
          dayStart.setHours(dayStartHour, 0, 0, 0);
          const dayEnd = new Date(d);
          dayEnd.setHours(dayEndHour, 0, 0, 0);

          // Start with one big free slot for the day
          let free: { s: number; e: number }[] = [{ s: dayStart.getTime(), e: dayEnd.getTime() }];

          const busy = (byDay.get(dayKey(d)) ?? []).sort((a, b) => a.s - b.s);

          // Subtract each busy interval from free slots
          for (const b of busy) {
            const next: { s: number; e: number }[] = [];
            for (const f of free) {
              // no overlap
              if (b.e <= f.s || b.s >= f.e) {
                next.push(f);
                continue;
              }
              // overlap: left free
              if (b.s > f.s) next.push({ s: f.s, e: b.s });
              // overlap: right free
              if (b.e < f.e) next.push({ s: b.e, e: f.e });
            }
            free = next;
          }

          // 4) Carve suggestions of 'durationMin' from the free intervals, future only
          for (const f of free) {
            // start at max(now, f.s)
            let start = Math.max(now, f.s);
            // snap to 15-min grid
            const SNAP = 15 * 60 * 1000;
            start = Math.ceil(start / SNAP) * SNAP;

            while (start + durationMin * 60000 <= f.e) {
              const end = start + durationMin * 60000;
              out.push({
                startISO: toISO(new Date(start)),
                endISO: toISO(new Date(end)),
                reason: "Free slot",
              });
              // do not spam too many per interval: step by duration
              start += durationMin * 60000;
            }
          }
        }

        if (!alive) return;
        setSuggestions(out.slice(0, 12)); // show up to 12 top slots
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to compute suggestions");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [rangeStart.getTime(), rangeEnd.getTime(), durationMin, dayStartHour, dayEndHour]);

  return { suggestions, loading, error };
}
