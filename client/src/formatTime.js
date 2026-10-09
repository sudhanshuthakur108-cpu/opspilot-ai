const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const STEPS = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
];

// "5 minutes ago", "yesterday", "3 weeks ago".
export function formatRelative(value, now = Date.now()) {
  let amount = (new Date(value).getTime() - now) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(amount) < size) return relative.format(Math.round(amount), unit);
    amount /= size;
  }
  return fullFormat.format(new Date(value));
}

export function formatDateTime(value) {
  return fullFormat.format(new Date(value));
}

// Today's calendar day in the reader's time zone, as "YYYY-MM-DD" (the format of due dates).
export function todayKey(now = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
