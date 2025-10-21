import React, { useEffect, useState } from "react";
import CalendarGrid from "./components/CalendarGrid";
import MonthGrid from "./components/MonthGrid";
import TasksPanel from "./components/TasksPanel";
import NlpInput from "./components/NlpInput";
import EventPopover from "./components/EventPopover";
import NewEventModal from "./components/NewEventModal";
import { getEvents, updateEvent, deleteEvent, createEvent } from "./api";
import type { EventItem } from "./types";
import { startOfWeek, addDays, toISO, clampToNow } from "./utils";
import { ToastProvider, Toaster, useToasts } from "./hooks/useToasts";
import { useEventColors } from "./hooks/useEventColors";

type View = "week" | "month";

function AppInner() {
  const [view, setView] = useState<View>("week");
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [newRange, setNewRange] = useState<{ s: string; e: string } | null>(null);
  const { show } = useToasts();
  const { getColor, setColor } = useEventColors();

  async function refreshEvents() {
    setLoading(true);
    try {
      let from = new Date(weekStart);
      let to = new Date(weekStart);
      if (view === "week") to = addDays(from, 7);
      else to = addDays(from, 35);
      from = clampToNow(from);
      const evs = await getEvents(toISO(from), toISO(to));
      setEvents(evs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshEvents();
  }, [weekStart, view]);

  function nav(delta: number) {
    if (view === "week") setWeekStart(addDays(weekStart, delta * 7));
    else setWeekStart(addDays(weekStart, delta * 30));
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="container">
          <div className="nav" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
            <h2 style={{ marginRight: 8 }}>Smart Hybrid Scheduler</h2>
            <button className="btn ghost" onClick={() => nav(-1)}>◀</button>
            <span style={{ minWidth: 240, textAlign: "center" }}>
              {view === "week" && `${weekStart.toLocaleDateString()} – ${addDays(weekStart, 6).toLocaleDateString()}`}
              {view === "month" && `${weekStart.toLocaleString(undefined, { month: "long", year: "numeric" })}`}
            </span>
            <button className="btn ghost" onClick={() => nav(1)}>▶</button>
            <div style={{ marginLeft: 8, display: "inline-flex", gap: 6 }}>
              <button className="btn ghost" onClick={() => setView("week")}>Week</button>
              <button className="btn ghost" onClick={() => setView("month")}>Month</button>
            </div>
          </div>
        </div>
      </header>

      <div className="container">
        <div className="main">
          {/* LEFT: Calendar column */}
          <div className="left">
            <div className="nlp-box">
              <NlpInput onAddedEvent={refreshEvents} />
                          </div>

            {view === "month" ? (
              <MonthGrid monthStart={weekStart} events={events} />
            ) : (
              <CalendarGrid
                weekStart={weekStart}
                events={events}
                daysToShow={7}
                onEventClick={setSelected}
                onCreateEvent={async (title, s, e) => {
                  await createEvent({ title, startISO: s, endISO: e, immutable: true, source: "app" });
                  await refreshEvents();
                  show("success", "Event created");
                }}
                onUpdateEvent={async (id, s, e) => {
                  await updateEvent(id, { startISO: s, endISO: e });
                  await refreshEvents();
                  show("success", "Event updated");
                }}
                onDeleteEvent={async (id) => {
                  await deleteEvent(id);
                  await refreshEvents();
                  show("success", "Event deleted");
                }}
                getEventColor={getColor}
                onOpenQuickNew={(s, e) => setNewRange({ s, e })}
              />
            )}
          </div>

          {/* RIGHT: Tasks sidebar (sticky, inner scroll) */}
          <aside className="right">
            <div className="card tasks-panel">
              {/* The inner wrapper is what scrolls; the panel itself stays fixed height */}
              <div className="scroll">
                <TasksPanel onAddedEvent={refreshEvents} />
              </div>
            </div>
          </aside>
        </div>
      </div>

      {selected && (
        <EventPopover
          event={selected}
          onClose={() => setSelected(null)}
          onSave={async (up) => {
            await updateEvent(selected!.eventId, up);
            await refreshEvents();
            show("success", "Event saved");
          }}
          onDelete={async () => {
            await deleteEvent(selected!.eventId);
            await refreshEvents();
            show("success", "Event deleted");
          }}
          getColor={getColor}
          setColor={setColor}
        />
      )}

      {newRange && (
        <NewEventModal
          defaultStartISO={newRange.s}
          defaultEndISO={newRange.e}
          onClose={() => setNewRange(null)}
          onCreate={async (title, s, e) => {
            await createEvent({ title, startISO: s, endISO: e, immutable: true, source: "app" });
            await refreshEvents();
            show("success", "Event created");
          }}
        />
      )}

      <Toaster />
      {loading && <div className="loading">Loading…</div>}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
