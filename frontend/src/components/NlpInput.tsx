import React, { useState } from "react";
import { createEvent } from "../api";

type Props = { onAddedEvent: () => void };

function nextFullHour(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(0,0,0);
  d.setHours(d.getHours() + 1);
  return d;
}

export default function NlpInput({ onAddedEvent }: Props) {
  const [text, setText] = useState("");

  async function handleAdd() {
    const raw = text.trim();
    if (!raw) return;

    const now = new Date();
    let start = new Date(now);
    let end = new Date(now.getTime() + 60*60000);
    let title = raw;

    const timeMatch = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const dateMatch = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const isTomorrow = /\btomorrow\b/i.test(raw);
    const isToday = /\btoday\b/i.test(raw);

    if (isTomorrow) {
      start.setDate(start.getDate() + 1);
      end.setDate(end.getDate() + 1);
    }
    if (dateMatch) {
      const [_, y, m, d] = dateMatch;
      start = new Date(Number(y), Number(m)-1, Number(d));
      end = new Date(start);
      end.setHours(start.getHours() + 1);
    }

    if (timeMatch) {
      const [_, hh, mm] = timeMatch;
      start.setHours(Number(hh), Number(mm), 0, 0);
      end = new Date(start.getTime() + 60*60000);
    } else {
      start = nextFullHour(now);
      end = new Date(start.getTime() + 60*60000);
    }

    title = title.replace(/\bat\s*([01]?\d|2[0-3]):[0-5]\d\b/i, "")
                 .replace(/\b(today|tomorrow)\b/ig, "")
                 .replace(/\s+/g, " ")
                 .trim();

    const payload = { title: title || "New event", startISO: start.toISOString().replace(/\.\d{3}Z$/, "Z"), endISO: end.toISOString().replace(/\.\d{3}Z$/, "Z"), immutable: true, source: "nlp" };
    await createEvent(payload);
    setText("");
    onAddedEvent();
  }

  return (
    <div style={{display:"contents"}}>
      <input
        placeholder="e.g., Lunch with Sarah tomorrow 13:00"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
      />
      <button className="btn primary" onClick={handleAdd}>Add</button>
    </div>
  );
}
