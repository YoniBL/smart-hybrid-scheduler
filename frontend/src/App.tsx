import React, { useEffect, useState } from "react";
import CalendarGrid from "./components/CalendarGrid";
import MonthGrid from "./components/MonthGrid";
import TasksPanel from "./components/TasksPanel";
import NlpInput from "./components/NlpInput";
import EventPopover from "./components/EventPopover";
import { getEvents, updateEvent, deleteEvent } from "./api";
import type { EventItem } from "./types";
import { startOfWeek, addDays, toISO, clampToNow } from "./utils";

type View = "day" | "week" | "month";

export default function App() {
  const [view, setView] = useState<View>("week");
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EventItem | null>(null);

  async function refreshEvents() {
    setLoading(true);
    try {
      let from = new Date(weekStart);
      let to = new Date(weekStart);
      if (view === "day") to = addDays(from, 1);
      else if (view === "week") to = addDays(from, 7);
      else to = addDays(from, 35);
      from = clampToNow(from);
      const evs = await getEvents(toISO(from), toISO(to));
      setEvents(evs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshEvents(); }, [weekStart, view]);

  function nav(delta: number) {
    if (view === "day") setWeekStart(addDays(weekStart, delta));
    else if (view === "week") setWeekStart(addDays(weekStart, delta * 7));
    else setWeekStart(addDays(weekStart, delta * 30));
  }

  return (
    <div className="app">
      <header className="topbar">
        <h2>Smart Hybrid Scheduler</h2>
        <div className="nav">
          <button onClick={() => nav(-1)}>◀</button>
          <span style={{minWidth: 240, textAlign: "center"}}>
            {view === "day" && weekStart.toLocaleDateString()}
            {view === "week" && `${weekStart.toLocaleDateString()} – ${addDays(weekStart, 6).toLocaleDateString()}`}
            {view === "month" && `${weekStart.toLocaleString(undefined, {month: "long", year: "numeric"})}`}
          </span>
          <button onClick={() => nav(1)}>▶</button>
          <div style={{ marginLeft: 8, display: "inline-flex", gap: 6 }}>
            <button onClick={() => setView("day")}>Day</button>
            <button onClick={() => setView("week")}>Week</button>
            <button onClick={() => setView("month")}>Month</button>
          </div>
        </div>
      </header>

      <div className="main">
        <div className="left">
          <NlpInput onAddedEvent={refreshEvents} />
          {view === "month" ? (
            <MonthGrid monthStart={weekStart} events={events} />
          ) : (
            <CalendarGrid
              weekStart={weekStart}
              events={events}
              daysToShow={view === "day" ? 1 : 7}
              onEventClick={setSelected}
            />
          )}
        </div>
        <div className="right">
          <TasksPanel onAddedEvent={refreshEvents} />
        </div>
      </div>

      {selected && (
        <EventPopover
          event={selected}
          onClose={() => setSelected(null)}
          onSave={async (up) => {
            await updateEvent(selected!.eventId, up);
            await refreshEvents();
          }}
          onDelete={async () => {
            await deleteEvent(selected!.eventId);
            await refreshEvents();
          }}
        />
      )}

      {loading && <div className="loading">Loading…</div>}
    </div>
  );
}
