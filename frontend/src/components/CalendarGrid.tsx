import React from "react";
import type { EventItem } from "../types";
import { addDays } from "../utils";

type Props = {
  weekStart: Date;
  events: EventItem[];
  daysToShow?: number;
  onEventClick?: (ev: EventItem) => void;
  onCreateEvent?: (title: string, startISO: string, endISO: string) => Promise<void>;
  onUpdateEvent?: (id: string, startISO: string, endISO: string) => Promise<void>;
  onDeleteEvent?: (id: string) => Promise<void>;
  getEventColor?: (id: string) => string;
  onOpenQuickNew?: (startISO: string, endISO: string) => void;
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
  weekStart, events, daysToShow = 7, onEventClick,
  onCreateEvent, onUpdateEvent, onDeleteEvent, getEventColor, onOpenQuickNew
}: Props) {
  const days = Array.from({ length: daysToShow }, (_, i) => addDays(weekStart, i));
  const hours = hoursRange(0, 24);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const columnsRef = React.useRef<(HTMLDivElement | null)[]>([]);

  const [drag, setDrag] = React.useState<DragState>({ kind: "none" });
  const [ghost, setGhost] = React.useState<{dayIndex:number, top:number, height:number} | null>(null);

  function yToMinutes(y: number) {
    return Math.max(0, Math.min(24*60, Math.round((y / HOUR_HEIGHT) * 60)));
  }
  function roundToSnapMinutes(d: Date, snapMin: number) {
    const ms = d.getTime();
    const snapMs = snapMin * 60 * 1000;
    const rounded = Math.round(ms / snapMs) * snapMs;
    return new Date(rounded);
  }

  function onGridClick(e: React.MouseEvent, dayIndex: number) {
    if (!onOpenQuickNew) return;
    if ((e.target as HTMLElement).closest(".event")) return;
    const col = columnsRef.current[dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const startMin = yToMinutes(y);
    const s = new Date(days[dayIndex]); s.setHours(0,0,0,0); s.setMinutes(startMin);
    const eDate = new Date(s.getTime() + 60 * 60000);
    const sSnap = roundToSnapMinutes(s, SNAP_MIN);
    const eSnap = roundToSnapMinutes(eDate, SNAP_MIN);
    onOpenQuickNew(toISO(sSnap), toISO(eSnap));
  }

  function onGridContextMenu(e: React.MouseEvent, dayIndex: number) {
    e.preventDefault();
    if (!onOpenQuickNew) return;
    if ((e.target as HTMLElement).closest(".event")) return;
    const col = columnsRef.current[dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const startMin = yToMinutes(y);
    const s = new Date(days[dayIndex]); s.setHours(0,0,0,0); s.setMinutes(startMin);
    const eDate = new Date(s.getTime() + 60 * 60000);
    onOpenQuickNew(toISO(s), toISO(eDate));
  }

  function onGridMouseDown(e: React.MouseEvent, dayIndex: number) {
    if ((e.target as HTMLElement).closest(".event")) return;
    const col = columnsRef.current[dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    setDrag({ kind: "create", dayIndex, startY: y, endY: y });
    setGhost({ dayIndex, top: y, height: 4 });
  }

  function onGridMouseMove(e: React.MouseEvent) {
    if (drag.kind !== "create") return;
    const col = columnsRef.current[drag.dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    setDrag({ ...drag, endY: y });
    const top = Math.min(drag.startY, y);
    const height = Math.max(10, Math.abs(y - drag.startY));
    setGhost({ dayIndex: drag.dayIndex, top, height });
  }

  async function onGridMouseUp() {
    if (drag.kind !== "create") { setGhost(null); return setDrag({ kind: "none" }); }
    if (!onCreateEvent) { setGhost(null); setDrag({ kind: "none" }); return; }
    const day = days[drag.dayIndex];
    const startMin = yToMinutes(Math.min(drag.startY, drag.endY));
    const endMin = yToMinutes(Math.max(drag.startY, drag.endY));
    if (endMin - startMin < 5) { setGhost(null); setDrag({ kind: "none" }); return; }
    const s = new Date(day); s.setHours(0,0,0,0); s.setMinutes(startMin);
    const e = new Date(day); e.setHours(0,0,0,0); e.setMinutes(endMin);
    const sSnap = roundToSnapMinutes(s, SNAP_MIN);
    const eSnap = roundToSnapMinutes(e, SNAP_MIN);
    await onCreateEvent("New event", toISO(sSnap), toISO(eSnap));
    setGhost(null);
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
      setGhost({ dayIndex, top: (startMin/60)*HOUR_HEIGHT, height: (durationMin/60)*HOUR_HEIGHT });
    } else if (Math.abs(yMin - endMin) <= 6) {
      setDrag({ kind: "resizeBottom", dayIndex, eventId: ev.eventId, anchorStartMin: startMin });
      setGhost({ dayIndex, top: (startMin/60)*HOUR_HEIGHT, height: (durationMin/60)*HOUR_HEIGHT });
    } else {
      const offset = yMin - startMin;
      setDrag({ kind: "move", dayIndex, eventId: ev.eventId, offsetMin: offset, durationMin });
      setGhost({ dayIndex, top: (startMin/60)*HOUR_HEIGHT, height: (durationMin/60)*HOUR_HEIGHT });
    }
  }

  function onMouseMoveAll(e: React.MouseEvent) {
    if (drag.kind === "none") return;
    const col = columnsRef.current[drag.dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const yMin = yToMinutes(y);

    if (drag.kind === "move") {
      let newStartMin = Math.max(0, Math.min(24*60 - drag.durationMin, yMin - drag.offsetMin));
      newStartMin = Math.round(newStartMin / SNAP_MIN) * SNAP_MIN;
      setGhost({ dayIndex: drag.dayIndex, top: (newStartMin/60)*HOUR_HEIGHT, height: (drag.durationMin/60)*HOUR_HEIGHT });
    } else if (drag.kind === "resizeTop") {
      let newStart = Math.min(yMin, drag.anchorEndMin - 5);
      newStart = Math.round(newStart / SNAP_MIN) * SNAP_MIN;
      setGhost({ dayIndex: drag.dayIndex, top: (newStart/60)*HOUR_HEIGHT, height: ((drag.anchorEndMin - newStart)/60)*HOUR_HEIGHT });
    } else if (drag.kind === "resizeBottom") {
      let newEnd = Math.max(yMin, drag.anchorStartMin + 5);
      newEnd = Math.round(newEnd / SNAP_MIN) * SNAP_MIN;
      setGhost({ dayIndex: drag.dayIndex, top: (drag.anchorStartMin/60)*HOUR_HEIGHT, height: ((newEnd - drag.anchorStartMin)/60)*HOUR_HEIGHT });
    }
  }

  async function onMouseUpAll(e: React.MouseEvent) {
    if (drag.kind === "none") return;
    const kind = drag.kind;
    const dayIndex = (drag as any).dayIndex;
    const day = days[dayIndex];

    const col = columnsRef.current[dayIndex];
    if (!col) { setGhost(null); setDrag({ kind: "none" }); return; }
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const yMin = yToMinutes(y);

    if (kind === "move" || kind === "resizeTop" || kind === "resizeBottom") {
      if (!onUpdateEvent) { setGhost(null); setDrag({ kind: "none" }); return; }

      const ev = events.find(x => x.eventId === (drag as any).eventId);
      if (!ev) { setGhost(null); setDrag({ kind: "none" }); return; }
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

    setGhost(null);
    setDrag({ kind: "none" });
  }

  return (
    <div className="cal" onMouseMove={onMouseMoveAll} onMouseUp={onMouseUpAll}>
      <div className="cal-head">
        <div className="time-col" />
        {days.map((d, i) => {
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <div className={"day-head" + (isToday ? " today" : "")} key={i}>
              <span className="weekday">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="date">{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      <div className="cal-body cal-scroll" ref={scrollRef}>
        <div className="time-col">
          {hours.map(h => (
            <div className="time-cell" key={h}>
              <div className="hh">{`${String(h).padStart(2, "0")}:00`}</div>
            </div>
          ))}
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
              className={"day-col" + (isToday ? " today" : "")}
              key={i}
              ref={el => (columnsRef.current[i] = el)}
              onMouseDown={(e) => onGridMouseDown(e, i)}
              onMouseMove={onGridMouseMove}
              onClick={(e) => onGridClick(e, i)}
              onContextMenu={(e) => onGridContextMenu(e, i)}
            >
              {hours.map(h => <div className="grid-cell" key={h} />)}
              {isToday && <div className="now-line" style={{ top: `${nowTop}px` }} />}

              {ghost && ghost.dayIndex === i && (
                <div className="drag-ghost" style={{ top: ghost.top, height: ghost.height }} />
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
                  ...(color ? ({ ["--event-color" as any]: color } as any) : {})
                };
                const durMin = Math.round((eDate.getTime() - s.getTime()) / 60000);
                const showTime = durMin > 60;

                return (
                  <div
                    className="event"
                    data-color={color ? "1" : ""}
                    key={ev.eventId}
                    style={style}
                    onMouseDown={(e) => onEventMouseDown(e, i, ev)}
                    onClick={() => onEventClick && onEventClick(ev)}
                    title={`${ev.title}`}
                  >
                    <div className="event-title">{ev.title}</div>
                    {showTime && (
                      <div className="event-time">
                        {s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        {' - '}
                        {eDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </div>
                    )}
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
