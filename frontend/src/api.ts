import type { EventItem, TaskItem, Availability, Suggestion } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const DEBUG_USER = import.meta.env.VITE_DEBUG_USER as string;

const headers = () => ({
  "Content-Type": "application/json",
  ...(DEBUG_USER ? { "X-Debug-User": DEBUG_USER } : {})
});

export async function getEvents(fromISO: string, toISO: string): Promise<EventItem[]> {
  const r = await fetch(`${API_BASE}/events?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`, {
    headers: headers()
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.events;
}

export async function createEvent(payload: {
  title: string; startISO: string; endISO: string; immutable?: boolean; source?: string;
}): Promise<EventItem> {
  const r = await fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ immutable: true, source: "app", ...payload })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return {
    eventId: data.eventId,
    title: data.title,
    startISO: data.startISO,
    endISO: data.endISO,
    immutable: data.immutable,
    source: data.source
  };
}

export async function updateEvent(eventId: string, payload: Partial<{title: string; startISO: string; endISO: string; immutable: boolean}>): Promise<EventItem> {
  const r = await fetch(`${API_BASE}/events/${eventId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function deleteEvent(eventId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/events/${eventId}`, {
    method: "DELETE",
    headers: headers()
  });
  if (!r.ok && r.status !== 204) throw new Error(await r.text());
}

export async function getTasks(): Promise<TaskItem[]> {
  const r = await fetch(`${API_BASE}/tasks`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.tasks;
}

export async function createTask(payload: { title: string; durationMin: number; category?: string; notes?: string }): Promise<TaskItem> {
  const r = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function deleteTask(taskId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: "DELETE",
    headers: headers()
  });
  if (!r.ok && r.status !== 204) throw new Error(await r.text());
}

export async function getAvailability(): Promise<Availability> {
  const r = await fetch(`${API_BASE}/availability`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function putAvailability(a: Availability): Promise<void> {
  const r = await fetch(`${API_BASE}/availability`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(a)
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function suggest(durationMin: number, fromISO: string, toISO: string): Promise<Suggestion[]> {
  const r = await fetch(`${API_BASE}/suggest`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ durationMin, fromISO, toISO })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.suggestions ?? [];
}
