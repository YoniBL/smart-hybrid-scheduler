import React from "react";

type EventItem = {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  immutable: boolean;
  source: string;
};

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

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
const DAY_START_MIN = 6 * 60;

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
  | { kind: "move"; originalDayIndex: number; eventId: string; offsetMin: number; durationMin: number }
  | { kind: "resizeTop"; dayIndex: number; eventId: string; anchorEndMin: number }
  | { kind: "resizeBottom"; dayIndex: number; eventId: string; anchorStartMin: number };

export default function CalendarGrid({
  weekStart, events, daysToShow = 7, onEventClick,
  onCreateEvent, onUpdateEvent, onDeleteEvent, getEventColor, onOpenQuickNew
}: Props) {
  const days = Array.from({ length: daysToShow }, (_, i) => addDays(weekStart, i));
  const hours = [...hoursRange(6, 24), ...hoursRange(0, 6)];
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const columnsRef = React.useRef<(HTMLDivElement | null)[]>([]);

  const [drag, setDrag] = React.useState<DragState>({ kind: "none" });
  const [ghost, setGhost] = React.useState<{dayIndex:number, top:number, height:number} | null>(null);
  const [panning, setPanning] = React.useState<{active: boolean, startY: number, startScroll: number}>({active:false, startY:0, startScroll:0});
  const [didPan, setDidPan] = React.useState(false);
  const draggedRef = React.useRef(false);
  const PAN_THRESHOLD = 3;

  function yToMinutesFrom6(y: number) {
    return Math.max(0, Math.min(24*60, Math.round((y / HOUR_HEIGHT) * 60)));
  }
  function roundToSnapMinutes(d: Date, snapMin: number) {
    const ms = d.getTime();
    const snapMs = snapMin * 60 * 1000;
    const rounded = Math.round(ms / snapMs) * snapMs;
    return new Date(rounded);
  }
  function applyMinutesFrom6(baseDay: Date, minutesFrom6: number) {
    const realMin = (minutesFrom6 + DAY_START_MIN) % (24 * 60);
    const out = new Date(baseDay);
    if (realMin < DAY_START_MIN) out.setDate(out.getDate() + 1);
    out.setHours(Math.floor(realMin / 60), realMin % 60, 0, 0);
    return out;
  }
  function minutesFrom6OfDate(d: Date) {
    const mins = d.getHours() * 60 + d.getMinutes();
    return (mins - DAY_START_MIN + 24*60) % (24*60);
  }

  // Helper to find which day column the mouse is over
  function getDayIndexFromX(clientX: number): number {
    for (let i = 0; i < columnsRef.current.length; i++) {
      const col = columnsRef.current[i];
      if (!col) continue;
      const rect = col.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        return i;
      }
    }
    return -1;
  }

  function onGridClick(e: React.MouseEvent, dayIndex: number) {
    if (!onOpenQuickNew) return;
    if (draggedRef.current) return;
    if ((e.target as HTMLElement).closest(".event")) return;
    const col = columnsRef.current[dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const startMinFrom6 = yToMinutesFrom6(y);
    const s = applyMinutesFrom6(days[dayIndex], startMinFrom6);
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
    const startMinFrom6 = yToMinutesFrom6(y);
    const s = applyMinutesFrom6(days[dayIndex], startMinFrom6);
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
    const startMin = yToMinutesFrom6(Math.min(drag.startY, drag.endY));
    const endMin = yToMinutesFrom6(Math.max(drag.startY, drag.endY));
    if (endMin - startMin < 5) { setGhost(null); setDrag({ kind: "none" }); return; }
    const s = applyMinutesFrom6(day, startMin);
    const e = applyMinutesFrom6(day, endMin);
    const sSnap = roundToSnapMinutes(s, SNAP_MIN);
    const eSnap = roundToSnapMinutes(e, SNAP_MIN);
    await onCreateEvent("New event", toISO(sSnap), toISO(eSnap));
    setGhost(null);
    setDrag({ kind: "none" });
  }

  function onEventMouseDown(e: React.MouseEvent, dayIndex: number, ev: EventItem) {
    e.stopPropagation(); // CRITICAL: Prevent grid mousedown from firing
    const target = e.target as HTMLElement;
    if (target.closest(".ev-actions")) return;
    if (e.button == 2) return;
    
    draggedRef.current = true; // Mark that we're dragging
    
    const s = toLocal(ev.startISO);
    const eDate = toLocal(ev.endISO);
    const startMin = minutesFrom6OfDate(s);
    const endMin = minutesFrom6OfDate(eDate);
    const durationMin = endMin - startMin;

    const col = columnsRef.current[dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
    const yMin = yToMinutesFrom6(y);

    if (Math.abs(yMin - startMin) <= 6) {
      setDrag({ kind: "resizeTop", dayIndex, eventId: ev.eventId, anchorEndMin: endMin });
      setGhost({ dayIndex, top: (startMin/60)*HOUR_HEIGHT, height: (durationMin/60)*HOUR_HEIGHT });
    } else if (Math.abs(yMin - endMin) <= 6) {
      setDrag({ kind: "resizeBottom", dayIndex, eventId: ev.eventId, anchorStartMin: startMin });
      setGhost({ dayIndex, top: (startMin/60)*HOUR_HEIGHT, height: (durationMin/60)*HOUR_HEIGHT });
    } else {
      const offset = yMin - startMin;
      setDrag({ kind: "move", originalDayIndex: dayIndex, eventId: ev.eventId, offsetMin: offset, durationMin });
      setGhost({ dayIndex, top: (startMin/60)*HOUR_HEIGHT, height: (durationMin/60)*HOUR_HEIGHT });
    }
  }

  function onMouseMoveAll(e: React.MouseEvent) {
    if (panning.active && scrollRef.current) {
      const dy = e.clientY - panning.startY;
      if (Math.abs(dy) > PAN_THRESHOLD) setDidPan(true);
      scrollRef.current.scrollTop = panning.startScroll - dy;
    }
    if (drag.kind === "none") return;

    if (drag.kind === "move") {
      // Find which day column the mouse is currently over
      const targetDayIndex = getDayIndexFromX(e.clientX);
      if (targetDayIndex === -1) return;

      const col = columnsRef.current[targetDayIndex];
      if (!col) return;
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
      const yMin = yToMinutesFrom6(y);

      let newStartMin = Math.max(0, Math.min(24*60 - drag.durationMin, yMin - drag.offsetMin));
      newStartMin = Math.round(newStartMin / SNAP_MIN) * SNAP_MIN;
      setGhost({ dayIndex: targetDayIndex, top: (newStartMin/60)*HOUR_HEIGHT, height: (drag.durationMin/60)*HOUR_HEIGHT });
    } else if (drag.kind === "resizeTop" || drag.kind === "resizeBottom") {
      const col = columnsRef.current[drag.dayIndex];
      if (!col) return;
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
      const yMin = yToMinutesFrom6(y);

      if (drag.kind === "resizeTop") {
        let newStart = Math.min(yMin, drag.anchorEndMin - 5);
        newStart = Math.round(newStart / SNAP_MIN) * SNAP_MIN;
        setGhost({ dayIndex: drag.dayIndex, top: (newStart/60)*HOUR_HEIGHT, height: ((drag.anchorEndMin - newStart)/60)*HOUR_HEIGHT });
      } else {
        let newEnd = Math.max(yMin, drag.anchorStartMin + 5);
        newEnd = Math.round(newEnd / SNAP_MIN) * SNAP_MIN;
        setGhost({ dayIndex: drag.dayIndex, top: (drag.anchorStartMin/60)*HOUR_HEIGHT, height: ((newEnd - drag.anchorStartMin)/60)*HOUR_HEIGHT });
      }
    }
  }

  async function onMouseUpAll(e: React.MouseEvent) {
    if (panning.active) {
      setPanning({active:false, startY:0, startScroll:0});
      setTimeout(() => setDidPan(false), 0);
    }
    if (drag.kind === "none") return;
    const kind = drag.kind;

    if (kind === "move") {
      if (!onUpdateEvent) { 
        setGhost(null); 
        setDrag({ kind: "none" }); 
        setTimeout(() => draggedRef.current = false, 100);
        return; 
      }

      const targetDayIndex = getDayIndexFromX(e.clientX);
      if (targetDayIndex === -1) {
        setGhost(null); 
        setDrag({ kind: "none" }); 
        setTimeout(() => draggedRef.current = false, 100);
        return;
      }

      const targetDay = days[targetDayIndex];
      const col = columnsRef.current[targetDayIndex];
      if (!col) { 
        setGhost(null); 
        setDrag({ kind: "none" }); 
        setTimeout(() => draggedRef.current = false, 100);
        return; 
      }

      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
      const yMin = yToMinutesFrom6(y);

      const ev = events.find(x => x.eventId === drag.eventId);
      if (!ev) { 
        setGhost(null); 
        setDrag({ kind: "none" }); 
        setTimeout(() => draggedRef.current = false, 100);
        return; 
      }

      let newStartMin = Math.max(0, Math.min(24*60 - drag.durationMin, yMin - drag.offsetMin));
      const startMin = Math.round(newStartMin / SNAP_MIN) * SNAP_MIN;
      const endMin = startMin + drag.durationMin;

      const sOut = applyMinutesFrom6(targetDay, startMin);
      const eOut = applyMinutesFrom6(targetDay, endMin);
      await onUpdateEvent(ev.eventId, toISO(sOut), toISO(eOut));

      setGhost(null);
      setDrag({ kind: "none" });
      setTimeout(() => draggedRef.current = false, 100);
    } else if (kind === "resizeTop" || kind === "resizeBottom") {
      if (!onUpdateEvent) { 
        setGhost(null); 
        setDrag({ kind: "none" }); 
        setTimeout(() => draggedRef.current = false, 100);
        return; 
      }

      const dayIndex = drag.dayIndex;
      const day = days[dayIndex];
      const col = columnsRef.current[dayIndex];
      if (!col) { 
        setGhost(null); 
        setDrag({ kind: "none" }); 
        setTimeout(() => draggedRef.current = false, 100);
        return; 
      }

      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
      const yMin = yToMinutesFrom6(y);

      const ev = events.find(x => x.eventId === drag.eventId);
      if (!ev) { 
        setGhost(null); 
        setDrag({ kind: "none" }); 
        setTimeout(() => draggedRef.current = false, 100);
        return; 
      }

      let startMin, endMin;
      if (kind === "resizeTop") {
        let newStart = Math.min(yMin, drag.anchorEndMin - 5);
        startMin = Math.round(newStart / SNAP_MIN) * SNAP_MIN;
        endMin = drag.anchorEndMin;
      } else {
        let newEnd = Math.max(yMin, drag.anchorStartMin + 5);
        endMin = Math.round(newEnd / SNAP_MIN) * SNAP_MIN;
        startMin = drag.anchorStartMin;
      }

      const sOut = applyMinutesFrom6(day, startMin);
      const eOut = applyMinutesFrom6(day, endMin);
      await onUpdateEvent(ev.eventId, toISO(sOut), toISO(eOut));

      setGhost(null);
      setDrag({ kind: "none" });
      setTimeout(() => draggedRef.current = false, 100);
    } else {
      setGhost(null);
      setDrag({ kind: "none" });
    }
  }

  return (
    <div
      className="cal"
      onMouseMove={onMouseMoveAll}
      onMouseUp={onMouseUpAll}
      onContextMenu={(e) => { if (didPan) { e.preventDefault(); setDidPan(false); } }}
    >
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

      <div
        className="cal-body cal-scroll"
        ref={scrollRef}
        onMouseDown={(e) => {
          if (e.button === 2 && scrollRef.current) {
            setPanning({active:true, startY: e.clientY, startScroll: scrollRef.current.scrollTop});
          }
        }}
      >
        <div className="time-col">
          {hours.map(h => (
            <div className="time-cell" key={h}>
              <div className="hh">{`${String(h).padStart(2, "0")}:00`}</div>
            </div>
          ))}
        </div>

        {days.map((d, i) => {
          const dayStart = new Date(d); dayStart.setHours(6,0,0,0);
          const nextStart = new Date(dayStart); nextStart.setDate(dayStart.getDate() + 1);
          const dayEventsRaw = events.filter(ev => {
            const s = toLocal(ev.startISO).getTime();
            return s >= dayStart.getTime() && s < nextStart.getTime();
          });
          const dayEvents = packDayEvents(dayEventsRaw);

          const now = new Date();
          const isToday = d.toDateString() === now.toDateString();
          const nowTop = isToday ? ((minutesFrom6OfDate(now)/60) * HOUR_HEIGHT) : -9999;

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
                const top = (minutesFrom6OfDate(s)/60) * HOUR_HEIGHT;
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!didPan && onEventClick) onEventClick(ev);
                    }}
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