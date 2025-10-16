import React from "react";
import type { EventItem } from "../types";

type Props = {
  monthStart: Date;
  events: EventItem[];
};

function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const day = first.getDay(); // 0=Sun
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - day);
  gridStart.setHours(0,0,0,0);
  return gridStart;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function MonthGrid({ monthStart, events }: Props) {
  const gridStart = startOfMonthGrid(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i*86400000));

  return (
    <div className="month">
      <div className="month-head">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="mhd">{d}</div>)}
      </div>
      <div className="month-body">
        {cells.map((day, i) => {
          const dayEvents = events.filter(ev => sameDay(new Date(ev.startISO), day)).slice(0,3);
          const isOtherMonth = day.getMonth() !== monthStart.getMonth();
          return (
            <div key={i} className={"mcell" + (isOtherMonth ? " other" : "")}>
              <div className="mdn">{day.getDate()}</div>
              <ul className="mlist">
                {dayEvents.map(ev => (
                  <li key={ev.eventId} className="mitem">
                    {new Date(ev.startISO).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} {ev.title}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
