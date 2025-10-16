export function toISO(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function startOfWeek(d = new Date()): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // Sunday=0
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function clampToNow(date: Date): Date {
  const now = new Date();
  return date < now ? now : date;
}
