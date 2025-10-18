import React, { useState } from "react";

type Props = {
  defaultStartISO: string;
  defaultEndISO: string;
  onCreate: (title: string, startISO: string, endISO: string) => Promise<void>;
  onClose: () => void;
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

export default function NewEventModal({ defaultStartISO, defaultEndISO, onCreate, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(toLocalInputValue(defaultStartISO));
  const [end, setEnd] = useState(toLocalInputValue(defaultEndISO));
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h4>New event</h4>
        <div className="form-row"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" /></div>
        <div className="form-row"><label>Start</label><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="form-row"><label>End</label><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></div>
        <div className="actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" disabled={!title || busy} onClick={async () => {
            setBusy(true);
            try {
              await onCreate(
                title,
                new Date(start).toISOString().replace(/\.\d{3}Z$/, "Z"),
                new Date(end).toISOString().replace(/\.\d{3}Z$/, "Z")
              );
              onClose();
            } finally { setBusy(false); }
          }}>Create</button>
        </div>
      </div>
    </div>
  );
}
