import { getIdToken } from './authClient';

const API_BASE = 'https://ne91eba4pe.execute-api.il-central-1.amazonaws.com/prod';

// Generic fetch wrapper that auto-attaches the Cognito ID token
async function authedFetch(path: string, init: RequestInit = {}) {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    // surface a readable error but don't poison downstream parsing
    throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

/** -------- Events -------- */
export async function getEvents(fromISO: string, toISO: string) {
  if (!fromISO || !toISO) return [];
  const qs = `from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;
  const data = await authedFetch(`/events?${qs}`);

  // Normalize to an array no matter the backend shape
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as any).events)) return (data as any).events;
  if (data && Array.isArray((data as any).items)) return (data as any).items;
  return [];
}

export async function createEvent(payload: {
  title: string;
  startISO: string;
  endISO: string;
  source?: string;
  immutable?: boolean;
}) {
  return authedFetch('/events', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateEvent(
  eventId: string,
  payload: Partial<{ title: string; startISO: string; endISO: string }>
) {
  return authedFetch(`/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteEvent(eventId: string) {
  return authedFetch(`/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
}

/** -------- Tasks -------- */
export async function listTasks() {
  const data = await authedFetch('/tasks', { method: 'GET' });
  // Normalize to array for TasksPanel
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as any).items)) return (data as any).items;
  if (data && Array.isArray((data as any).tasks)) return (data as any).tasks;
  if (data && typeof data === 'object') {
    const vals = Object.values(data as any);
    const firstArr = vals.find((v) => Array.isArray(v));
    if (firstArr) return firstArr as any[];
  }
  return [];
}

// Alias some components use
export const getTasks = listTasks;

export async function createTask(
  title: unknown,
  durationMin: unknown,
  category?: unknown,
  notes?: unknown
) {
  // Coerce title to a safe string
  const cleanTitle = (typeof title === 'string' ? title : String(title ?? '')).trim();
  if (!cleanTitle) throw new Error('Task title is required');

  // Coerce duration to a positive number (handles numbers, numeric strings, some { value: ... } shapes)
  const raw =
    typeof durationMin === 'number'
      ? durationMin
      : typeof durationMin === 'string'
      ? Number(durationMin)
      : (durationMin as any)?.value ?? Number(durationMin as any);

  const minutesNum = Number(raw);
  if (!Number.isFinite(minutesNum) || minutesNum <= 0) {
    throw new Error('Task duration (minutes) must be a positive number');
  }

  // Send exactly what the backend expects
  const body: any = {
    title: cleanTitle,
    durationMin: minutesNum,
  };
  if (category != null && String(category).trim() !== '') body.category = String(category);
  if (notes != null && String(notes).trim() !== '') body.notes = String(notes);

  return authedFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteTask(taskId: string) {
  return authedFetch(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

/** -------- Suggestion / Availability -------- */
export async function suggest(params: {
  durationMin: number;
  fromISO: string;
  toISO: string;
  timezone?: string;
  windows?: Record<string, [string, string][]>;
}) {
  const { durationMin, fromISO, toISO, ...rest } = params;
  const data = await authedFetch('/suggest', {
    method: 'POST',
    body: JSON.stringify({ durationMin, fromISO, toISO, ...rest }),
  });
  return data.suggestions || []; // Return just the array
}

export async function getAvailability() {
  return authedFetch('/availability', { method: 'GET' });
}

export async function setAvailability(payload: {
  timezone: string;
  Mon?: [string, string][];
  Tue?: [string, string][];
  Wed?: [string, string][];
  Thu?: [string, string][];
  Fri?: [string, string][];
  Sat?: [string, string][];
  Sun?: [string, string][];
}) {
  return authedFetch('/availability', { method: 'PUT', body: JSON.stringify(payload) });
}

/** -------- Public health (no auth) -------- */
export async function health() {
  const res = await fetch(`${API_BASE}/health`);
  return res.text();
}
