import React, { useState } from "react";
import * as chrono from "chrono-node";
import { createEvent, createTask, suggest } from "../api";
import { toISO, startOfWeek, addDays } from "../utils";

type Props = { onAddedEvent: () => void; };

export default function NlpInput({ onAddedEvent }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const defaultDurationMin = 60;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const parsed = chrono.parse(text, new Date(), { forwardDate: true });
      if (parsed.length) {
        const p = parsed[0];
        const title = text.replace(p.text, "").trim() || "Untitled";
        const s = p.start?.date();
        const eDate = p.end?.date();
        if (s) {
          const startISO = toISO(s);
          const endISO = toISO(eDate ?? new Date(s.getTime() + defaultDurationMin * 60000));
          await createEvent({ title, startISO, endISO, immutable: true, source: "app" });
          setText("");
          onAddedEvent();
          return;
        }
      }
      await createTask({ title: text.trim(), durationMin: defaultDurationMin });
      const wk = startOfWeek(new Date());
      await suggest(defaultDurationMin, toISO(wk), toISO(addDays(wk, 7)));
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="nlp-form">
      <input
        placeholder='Try: "lunch with Sarah tomorrow 1pm"'
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <button disabled={busy}>Add</button>
    </form>
  );
}
