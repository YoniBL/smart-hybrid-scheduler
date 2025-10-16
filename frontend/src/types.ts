export type EventItem = {
  eventId: string;
  title: string;
  startISO: string;
  endISO: string;
  immutable: boolean;
  source: string;
};

export type TaskItem = {
  taskId: string;
  title: string;
  durationMin: number;
  category?: string;
  notes?: string;
  createdAt: string;
};

export type Suggestion = {
  startISO: string;
  endISO: string;
  score: number;
  reasons: string[];
};

export type Availability = {
  weekly: Record<string, [string, string][]>;
  timezone: string;
};
