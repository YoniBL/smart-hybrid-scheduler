import React, { useEffect, useState } from "react";
import type { EventItem } from "../types";

type Props = {
  event: EventItem | null;
  onClose: () => void;
  onSave: (updates: { title: string; startISO: string; endISO: string }) => Promise<void>;
  onDelete: () => Promise<void>;
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

export default function EventPopover({ event, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setStart(toLocalInputValue(event.startISO));
      setEnd(toLocalInputValue(event.endISO));
    }
  }, [event]);

  if (!event) return null;

  return (
    <div className="modal">
      <div className="card">
        <h4>Edit event</h4>
        <div className="form-row"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="form-row"><label>Start</label><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="form-row"><label>End</label><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></div>

        <div className="actions">
          <button onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                title,
                startISO: new Date(start).toISOString().replace(/\.\d{3}Z$/, "Z"),
                endISO: new Date(end).toISOString().replace(/\.\d{3}Z$/, "Z"),
              });
              onClose();
            } finally { setBusy(false); }
          }} disabled={busy}>Save</button>
          <button onClick={async () => { setBusy(true); try { await onDelete(); onClose(); } finally { setBusy(false); } }} disabled={busy}>Delete</button>
          <button onClick={onClose} disabled={busy}>Close</button>
        </div>
      </div>
    </div>
  );
}
