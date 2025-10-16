import React, { useEffect, useState } from "react";
import type { EventItem } from "../types";

type Props = {
  event: EventItem | null;
  onClose: () => void;
  onSave: (updates: { title: string; startISO: string; endISO: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  getColor?: (id: string) => string;
  setColor?: (id: string, color: string) => void;
};

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

const PALETTE = ["#2563eb", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#6b7280"];

export default function EventPopover({ event, onClose, onSave, onDelete, getColor, setColor }: Props) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [color, setLocalColor] = useState<string>("");

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setStart(toLocalInputValue(event.startISO));
      setEnd(toLocalInputValue(event.endISO));
      setLocalColor(getColor ? getColor(event.eventId) : "");
    }
  }, [event, getColor]);

  if (!event) return null;

  return (
    <div className="modal">
      <div className="card">
        <h4>Edit event</h4>
        <div className="form-row"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="form-row"><label>Start</label><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="form-row"><label>End</label><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></div>
        <div className="form-row">
          <label>Color</label>
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            {PALETTE.map(c => (
              <button key={c}
                aria-label={`Pick ${c}`}
                onClick={() => setLocalColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: 9999, border: color===c ? "2px solid #111" : "1px solid #ddd",
                  background: c, cursor: "pointer"
                }}
              />
            ))}
            <input type="color" value={color || "#2563eb"} onChange={e => setLocalColor(e.target.value)} style={{marginLeft:8}}/>
          </div>
        </div>

        <div className="actions">
          <button className="btn danger" onClick={async () => { setBusy(true); try { await onDelete(); onClose(); } finally { setBusy(false); } }} disabled={busy}>Delete</button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn primary" onClick={async () => {
            setBusy(true);
            try {
              if (setColor) setColor(event.eventId, color || "#2563eb");
              await onSave({
                title,
                startISO: new Date(start).toISOString().replace(/\.\d{3}Z$/, "Z"),
                endISO: new Date(end).toISOString().replace(/\.\d{3}Z$/, "Z"),
              });
              onClose();
            } finally { setBusy(false); }
          }} disabled={busy}>Save</button>
        </div>
      </div>
    </div>
  );
}
