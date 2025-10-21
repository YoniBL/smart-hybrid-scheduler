import React, { useEffect, useState } from "react";
import type { TaskItem, Suggestion } from "../types";
import { createTask, deleteTask, getTasks, suggest, createEvent } from "../api";
import { toISO, startOfWeek, addDays } from "../utils";

type Props = { onAddedEvent: () => void };

export default function TasksPanel({ onAddedEvent }: Props) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(false);

  // Suggest flow
  const [sugs, setSugs] = useState<Suggestion[] | null>(null);
  const [forTask, setForTask] = useState<TaskItem | null>(null);
  const [desiredDuration, setDesiredDuration] = useState<number>(60); // user picks when suggesting

  async function refresh() {
    const t = await getTasks();
    setTasks(t);
  }
  useEffect(() => { refresh(); }, []);

  // Create task: no duration asked. We silently set default 60 to satisfy backend for storage,
  // but we won't display it and we allow changing at suggest-time.
  async function onAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setLoading(true);
    try {
      await createTask({ title: newTitle.trim(), durationMin: 60 });
      setNewTitle("");
      await refresh();
    } finally { setLoading(false); }
  }

  async function onSuggest(t: TaskItem) {
    setLoading(true);
    try {
      const wk = startOfWeek(new Date());
      const fromISO = toISO(wk);
      const toISOstr = toISO(addDays(wk, 7));
      // Use the user's currently chosen duration for suggestion (default 60)
      const res = await suggest(desiredDuration, fromISO, toISOstr);
      setSugs(res);
      setForTask(t);
    } finally { setLoading(false); }
  }

  async function onAcceptSuggestion(s: Suggestion) {
    if (!forTask) return;
    setLoading(true);
    try {
      await createEvent({
        title: forTask.title,
        startISO: s.startISO,
        endISO: s.endISO,
        immutable: true,
        source: "app"
      });
      setSugs(null);
      setForTask(null);
      await refresh();
      onAddedEvent();
    } finally { setLoading(false); }
  }

  return (
    <div className="tasks-panel">
      <h3>Tasks</h3>

      {/* Create task — no duration field */}
      <form onSubmit={onAddTask} className="task-form">
        <input
          placeholder="Task title"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
        />
        <button disabled={loading}>Add</button>
      </form>

      {/* Pick duration only when asking for suggestions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: "#555" }}>Suggest duration (min)</label>
        <input
          type="number"
          min={5}
          max={480}
          value={desiredDuration}
          onChange={e => setDesiredDuration(Number(e.target.value))}
          style={{ width: 80, padding: 6 }}
        />
      </div>

      {/* List shows only titles; no time/duration displayed */}
      <ul className="tasks-list">
        {tasks.map(t => (
          <li key={t.taskId} className="task-row">
            <div className="task-title">{t.title}</div>
            <div className="task-actions">
              <button onClick={() => onSuggest(t)} disabled={loading}>Suggest</button>
              <button
                onClick={async () => { await deleteTask(t.taskId); await refresh(); }}
                disabled={loading}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {sugs && (
        <div className="suggest-modal">
          <div className="suggest-card">
            <h4>Suggestions for: {forTask?.title}</h4>
            <ul className="sug-list">
              {sugs.map((s, i) => (
                <li key={i}>
                  <div>
                    <div>
                      {new Date(s.startISO).toLocaleString()} →{" "}
                      {new Date(s.endISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <button onClick={() => onAcceptSuggestion(s)} disabled={loading}>Add</button>
                </li>
              ))}
            </ul>
            <button className="close" onClick={() => { setSugs(null); setForTask(null); }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
