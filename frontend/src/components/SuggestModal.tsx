import React from "react";
import { useSuggestions } from "../hooks/useSuggestions";

type Props = {
  title: string;
  rangeStart: Date;
  rangeEnd: Date;
  durationMin?: number;
  onCreate: (title: string, startISO: string, endISO: string) => Promise<void>;
  onClose: () => void;
};

export default function SuggestModal({
  title,
  rangeStart,
  rangeEnd,
  durationMin = 60,
  onCreate,
  onClose,
}: Props) {
  const { suggestions, loading, error } = useSuggestions(rangeStart, rangeEnd, {
    durationMin,
  });

  return (
    <div className="modal" data-anim onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h4>Suggestions for: {title}</h4>

        {loading && <p>Looking for gaps…</p>}
        {error && <p style={{ color: "crimson" }}>{error}</p>}

        {!loading && !error && suggestions.length === 0 && (
          <p>No suitable free time found in the visible range.</p>
        )}

        <ul style={{ margin: "8px 0 12px", paddingLeft: 18 }}>
          {suggestions.map((s, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <button
                className="btn"
                onClick={() => onCreate(title, s.startISO, s.endISO)}
              >
                {new Date(s.startISO).toLocaleString([], {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}{" "}
                →{" "}
                {new Date(s.endISO).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </button>
            </li>
          ))}
        </ul>

        <div className="actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
