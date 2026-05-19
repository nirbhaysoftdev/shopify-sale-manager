// All campaign times are interpreted in Europe/London regardless of the
// user's browser timezone. The datetime-local inputs hold a wall-clock string
// ("YYYY-MM-DDTHH:mm") that we treat as Europe/London time, then we convert
// to/from UTC at the API boundary so the DB and scheduler always work in UTC.

const UK_TZ = "Europe/London";

// Convert a "YYYY-MM-DDTHH:mm" string (assumed Europe/London wall-clock) to a
// UTC ISO string. We're solving instant = requestedWall − offset(instant); the
// loop converges in one step normally and at most two across a DST cliff.
export function ukLocalToUtcIso(localStr) {
  if (!localStr) return null;
  const [datePart, timePart = "00:00"] = localStr.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  if ([y, mo, d, h, mi].some(Number.isNaN)) return null;

  const requestedUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = requestedUtc;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: UK_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(guess));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const wallAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    const offset = wallAsUtc - guess;
    const next = requestedUtc - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}

// Format an ISO/Date as a Europe/London wall-clock string for display.
export function formatUkDateTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export function formatUkDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatUkTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

// Current Europe/London wall-clock as "YYYY-MM-DDTHH:mm", suitable for the
// `min` attribute of a datetime-local input.
export function nowUkLocal() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
