import React from "react";
import type { EventItem } from "../types";
import { addDays } from "../utils";

type Props = {
  weekStart: Date;
  events: EventItem[];
  daysToShow?: number; // 1 (Day) or 7 (Week)
  onEventClick?: (ev: EventItem) => void;
};

const HOUR_HEIGHT = 48; // px per hour

function hoursRange(start: number, end: number) {
  return Array.from({ length: end - start }, (_, i) => i + start);
}

function toLocal(iso: string) { return new Date(iso); }

type Placed = EventItem & { _leftPct: number; _widthPct: number };

function overlaps(a: EventItem, b: EventItem) {
  const as = new Date(a.startISO).getTime();
  const ae = new Date(a.endISO).getTime();
  const bs = new Date(b.startISO).getTime();
  const be = new Date(b.endISO).getTime();
  return !(ae <= bs || be <= as);
}

function packDayEvents(dayEvents: EventItem[]): Placed[] {
  const sorted = [...dayEvents].sort((a,b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime());
  const columns: EventItem[][] = [];
  for (const ev of sorted) {
    let placed = false;
    for (const col of columns) {
      if (!overlaps(col[col.length - 1], ev)) { col.push(ev); placed = true; break; }
    }
    if (!placed) columns.push([ev]);
  }
  const total = Math.max(columns.length, 1);
  const widthPct = 100/total;
  const placed: Placed[] = [];
  columns.forEach((col, i) => col.forEach(ev => placed.push({ ...ev, _leftPct: i*widthPct, _widthPct: widthPct })));
  return placed;
}

export default function CalendarGrid({ weekStart, events, daysToShow = 7, onEventClick }: Props) {
  const days = Array.from({ length: daysToShow }, (_, i) => addDays(weekStart, i));
  const hours = hoursRange(0, 24); // full-day grid

  // Scroll container + auto-scroll to "now"
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const y = (minutes / 60) * HOUR_HEIGHT;
    scrollRef.current.scrollTop = Math.max(0, y - 6 * HOUR_HEIGHT); // position "now" ~1/3 from top
  }, []);

  return (
    <div className="cal">
      <div className="cal-head">
        <div className="time-col" />
        {days.map((d, i) => (
          <div className="day-head" key={i}>
            {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </div>
        ))}
      </div>

      <div className="cal-body cal-scroll" ref={scrollRef}>
        <div className="time-col">
          {hours.map(h => <div className="time-cell" key={h}>{`${String(h).padStart(2, "0")}:00`}</div>)}
        </div>

        {days.map((d, i) => {
          const dayEventsRaw = events.filter(ev => {
            const s = toLocal(ev.startISO);
            return s.getFullYear() === d.getFullYear() &&
                   s.getMonth() === d.getMonth() &&
                   s.getDate() === d.getDate();
          });
          const dayEvents = packDayEvents(dayEventsRaw);

          // Today line
          const now = new Date();
          const isToday = d.toDateString() === now.toDateString();
          const nowTop = ((now.getHours() + now.getMinutes()/60)) * HOUR_HEIGHT;

          return (
            <div className="day-col" key={i}>
              {hours.map(h => <div className="grid-cell" key={h} />)}

              {isToday && <div className="now-line" style={{ top: `${nowTop}px` }} />}

              {dayEvents.map(ev => {
                const s = toLocal(ev.startISO);
                const e = toLocal(ev.endISO);
                const top = ((s.getHours() + s.getMinutes()/60)) * HOUR_HEIGHT;
                const height = Math.max(20, ((e.getTime() - s.getTime())/3600000) * HOUR_HEIGHT);
                return (
                  <div
                    className="event"
                    key={ev.eventId}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${ev._leftPct}% + 8px)`,
                      width: `calc(${ev._widthPct}% - 16px)`
                    }}
                    onClick={() => onEventClick && onEventClick(ev)}
                    title={`${ev.title} (${s.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} - ${e.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})})`}
                  >
                    <div className="event-title">{ev.title}</div>
                    <div className="event-time">
                      {s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
