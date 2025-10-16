import React from "react";
import type { EventItem } from "../types";
import { addDays } from "../utils";

type Props = {
  weekStart: Date;
  events: EventItem[];
  daysToShow?: number;
  onEventClick?: (ev: EventItem) => void;
  registerScrollToNow?: (fn: () => void) => void;
  onCreateEvent?: (startISO: string, endISO: string) => Promise<void>;
  onUpdateEvent?: (id: string, startISO: string, endISO: string) => Promise<void>;
  onDeleteEvent?: (id: string) => Promise<void>;
  getEventColor?: (id: string) => string;
};

const HOUR_HEIGHT = 48;
const SNAP_MIN = 15;

function hoursRange(start: number, end: number) {
  return Array.from({ length: end - start }, (_, i) => i + start);
}
function toLocal(iso: string) { return new Date(iso); }
function toISO(d: Date) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }

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

type DragState =
  | { kind: "none" }
  | { kind: "create"; dayIndex: number; startY: number; endY: number }
  | { kind: "move"; dayIndex: number; eventId: string; offsetMin: number; durationMin: number }
  | { kind: "resizeTop"; dayIndex: number; eventId: string; anchorEndMin: number }
  | { kind: "resizeBottom"; dayIndex: number; eventId: string; anchorStartMin: number };

export default function CalendarGrid({
  weekStart, events, daysToShow = 7, onEventClick, registerScrollToNow,
  onCreateEvent, onUpdateEvent, onDeleteEvent, getEventColor
}: Props) {
  const days = Array.from({ length: daysToShow }, (_, i) => addDays(weekStart, i));
  const hours = hoursRange(0, 24);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const columnsRef = React.useRef<(HTMLDivElement | null)[]>([]);

  const scrollToNow = React.useCallback(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const y = (minutes / 60) * HOUR_HEIGHT;
    scrollRef.current.scrollTop = Math.max(0, y - 6 * HOUR_HEIGHT);
  }, []);

  React.useEffect(() => { scrollToNow(); }, [scrollToNow]);
  React.useEffect(() => { if (registerScrollToNow) registerScrollToNow(scrollToNow); }, [registerScrollToNow, scrollToNow]);

  const [drag, setDrag] = React.useState<DragState>({ kind: "none" });

  function yToMinutes(y: number) {
    return Math.max(0, Math.min(24*60, Math.round((y / HOUR_HEIGHT) * 60)));
  }
  function roundToSnapMinutes(d: Date, snapMin: number) {
    const ms = d.getTime();
    const snapMs = snapMin * 60 * 1000;
    const rounded = Math.round(ms / snapMs) * snapMs;
    return new Date(rounded);
  }

  function onGridMouseDown(e: React.MouseEvent, dayIndex: number) {
    if ((e.target as HTMLElement).closest(".event")) return;
    const col = columnsRef.current[dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    setDrag({ kind: "create", dayIndex, startY: y, endY: y });
  }
  function onGridMouseMove(e: React.MouseEvent) {
    if (drag.kind !== "create") return;
    const col = columnsRef.current[drag.dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    setDrag({ ...drag, endY: y });
  }
  async function onGridMouseUp() {
    if (drag.kind !== "create") return setDrag({ kind: "none" });
    if (!onCreateEvent) { setDrag({ kind: "none" }); return; }
    const day = days[drag.dayIndex];
    const startMin = yToMinutes(Math.min(drag.startY, drag.endY));
    const endMin = yToMinutes(Math.max(drag.startY, drag.endY));
    if (endMin - startMin < 5) { setDrag({ kind: "none" }); return; }
    const s = new Date(day); s.setHours(0,0,0,0); s.setMinutes(startMin);
    const e = new Date(day); e.setHours(0,0,0,0); e.setMinutes(endMin);
    const sSnap = roundToSnapMinutes(s, SNAP_MIN);
    const eSnap = roundToSnapMinutes(e, SNAP_MIN);
    await onCreateEvent(toISO(sSnap), toISO(eSnap));
    setDrag({ kind: "none" });
  }

  function onEventMouseDown(e: React.MouseEvent, dayIndex: number, ev: EventItem) {
    const target = e.target as HTMLElement;
    if (target.closest(".ev-actions")) return;
    const s = toLocal(ev.startISO);
    const eDate = toLocal(ev.endISO);
    const startMin = s.getHours()*60 + s.getMinutes();
    const endMin = eDate.getHours()*60 + eDate.getMinutes();
    const durationMin = endMin - startMin;

    const col = columnsRef.current[dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const yMin = yToMinutes(y);

    if (Math.abs(yMin - startMin) <= 6) {
      setDrag({ kind: "resizeTop", dayIndex, eventId: ev.eventId, anchorEndMin: endMin });
    } else if (Math.abs(yMin - endMin) <= 6) {
      setDrag({ kind: "resizeBottom", dayIndex, eventId: ev.eventId, anchorStartMin: startMin });
    } else {
      const offset = yMin - startMin;
      setDrag({ kind: "move", dayIndex, eventId: ev.eventId, offsetMin: offset, durationMin });
    }
  }

  async function onMouseMoveAll(e: React.MouseEvent) {
    if (drag.kind === "none") return;
  }
  async function onMouseUpAll(e: React.MouseEvent) {
    if (drag.kind === "none") return;
    const kind = drag.kind;
    const dayIndex = (drag as any).dayIndex;
    const day = days[dayIndex];
    const col = columnsRef.current[dayIndex];
    if (!col) { setDrag({ kind: "none" }); return; }
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const yMin = yToMinutes(y);

    if (kind === "move" || kind === "resizeTop" || kind === "resizeBottom") {
      if (!onUpdateEvent) { setDrag({ kind: "none" }); return; }
      const ev = events.find(x => x.eventId === (drag as any).eventId);
      if (!ev) { setDrag({ kind: "none" }); return; }
      const s = toLocal(ev.startISO);
      const eDate = toLocal(ev.endISO);
      let startMin = s.getHours()*60 + s.getMinutes();
      let endMin = eDate.getHours()*60 + eDate.getMinutes();

      if (kind === "move") {
        let newStartMin = Math.max(0, Math.min(24*60 - drag.durationMin, yMin - drag.offsetMin));
        startMin = Math.round(newStartMin / SNAP_MIN) * SNAP_MIN;
        endMin = startMin + drag.durationMin;
      } else if (kind === "resizeTop") {
        let newStart = Math.min(yMin, drag.anchorEndMin - 5);
        startMin = Math.round(newStart / SNAP_MIN) * SNAP_MIN;
        endMin = drag.anchorEndMin;
      } else if (kind === "resizeBottom") {
        let newEnd = Math.max(yMin, drag.anchorStartMin + 5);
        endMin = Math.round(newEnd / SNAP_MIN) * SNAP_MIN;
        startMin = drag.anchorStartMin;
      }

      const sOut = new Date(day); sOut.setHours(0,0,0,0); sOut.setMinutes(startMin);
      const eOut = new Date(day); eOut.setHours(0,0,0,0); eOut.setMinutes(endMin);
      await onUpdateEvent(ev.eventId, toISO(sOut), toISO(eOut));
    }
    setDrag({ kind: "none" });
  }

  return (
    <div className="cal" onMouseMove={onMouseMoveAll} onMouseUp={onMouseUpAll}>
      <div className="cal-head">
        <div className="time-col" />
        {days.map((d, i) => (
          <div className="day-head" key={i}>
            <span>{d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
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

          const now = new Date();
          const isToday = d.toDateString() === now.toDateString();
          const nowTop = ((now.getHours() + now.getMinutes()/60)) * HOUR_HEIGHT;

          return (
            <div
              className="day-col"
              key={i}
              ref={el => (columnsRef.current[i] = el)}
              onMouseDown={(e) => onGridMouseDown(e, i)}
              onMouseMove={onGridMouseMove}
            >
              {hours.map(h => <div className="grid-cell" key={h} />)}
              {isToday && <div className="now-line" style={{ top: `${nowTop}px` }} />}

              {drag.kind === "create" && drag.dayIndex === i && (
                (() => {
                  const topMin = yToMinutes(Math.min(drag.startY, drag.endY));
                  const botMin = yToMinutes(Math.max(drag.startY, drag.endY));
                  const topPx = (topMin/60) * HOUR_HEIGHT;
                  const heightPx = Math.max(10, ((botMin - topMin)/60) * HOUR_HEIGHT);
                  return <div className="create-preview" style={{ top: topPx, height: heightPx }} />;
                })()
              )}

              {dayEvents.map(ev => {
                const s = toLocal(ev.startISO);
                const eDate = toLocal(ev.endISO);
                const top = ((s.getHours() + s.getMinutes()/60)) * HOUR_HEIGHT;
                const height = Math.max(20, ((eDate.getTime() - s.getTime())/3600000) * HOUR_HEIGHT);
                const color = getEventColor ? getEventColor(ev.eventId) : "";
                const style: React.CSSProperties = {
                  top: `${top}px`,
                  height: `${height}px`,
                  left: `calc(${(ev as any)._leftPct}% + 8px)`,
                  width: `calc(${(ev as any)._widthPct}% - 16px)`,
                  // pipeline: set CSS var for color-mix usage in CSS
                  ...(color ? ({ ["--event-color" as any]: color } as any) : {})
                };
                return (
                  <div
                    className="event"
                    data-color={color ? "1" : ""}
                    key={ev.eventId}
                    style={style}
                    onMouseDown={(e) => onEventMouseDown(e, i, ev)}
                  >
                    <div className="ev-actions">
                      <button title="Edit" onClick={(e) => { e.stopPropagation(); onEventClick && onEventClick(ev); }}>✏️</button>
                      <button title="Delete" onClick={async (e) => { e.stopPropagation(); onDeleteEvent && await onDeleteEvent(ev.eventId); }}>🗑</button>
                    </div>
                    <div className="event-title">{ev.title}</div>
                    <div className="event-time">
                      {s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {eDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
