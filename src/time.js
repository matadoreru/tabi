export const DEFAULT_TIME_ZONE = "UTC";

export function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: String(value) }).format();
    return Boolean(value);
  } catch {
    return false;
  }
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
}

export function todayInTimeZone(timeZone = browserTimeZone(), instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function partsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
}

/** Converts a wall-clock date/time plus IANA zone to an immutable UTC instant. */
export function zonedDateTimeToUtc(date, time = "00:00", timeZone = DEFAULT_TIME_ZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  if (!isValidTimeZone(timeZone)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = partsAt(new Date(candidate), timeZone);
    const represented = Date.UTC(
      Number(local.year),
      Number(local.month) - 1,
      Number(local.day),
      Number(local.hour),
      Number(local.minute),
      Number(local.second),
    );
    candidate += desired - represented;
  }
  const result = new Date(candidate);
  const check = partsAt(result, timeZone);
  if (`${check.year}-${check.month}-${check.day}T${check.hour}:${check.minute}` !== `${date}T${time.slice(0, 5)}`) {
    return null; // Hora local inexistente durante un salto DST.
  }
  return result.toISOString();
}

export function formatZonedDateTime(value, timeZone, options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}

export function timeZoneOptions(current = "") {
  const common = [
    "UTC",
    "Europe/Madrid",
    "Europe/London",
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "America/Mexico_City",
    "America/Argentina/Buenos_Aires",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Asia/Shanghai",
    "Asia/Bangkok",
    "Australia/Sydney",
  ];
  if (current && isValidTimeZone(current) && !common.includes(current)) common.push(current);
  return common.map((value) => ({ value, label: value.replaceAll("_", " ") }));
}

export function attachTemporalInstants(collection, data, tripTimeZone = DEFAULT_TIME_ZONE) {
  const result = { ...data };
  if (collection === "activities") {
    result.timeZone ||= tripTimeZone;
    result.startsAt = zonedDateTimeToUtc(result.date, result.start, result.timeZone);
    result.endsAt = zonedDateTimeToUtc(result.date, result.end, result.timeZone);
  } else if (collection === "stays") {
    result.timeZone ||= tripTimeZone;
    result.checkInAt = zonedDateTimeToUtc(result.checkInDate, result.checkInTime || "15:00", result.timeZone);
    result.checkOutAt = zonedDateTimeToUtc(result.checkOutDate, result.checkOutTime || "11:00", result.timeZone);
  } else if (collection === "transports") {
    result.departureTimeZone ||= tripTimeZone;
    result.arrivalTimeZone ||= result.departureTimeZone;
    result.departureAt = zonedDateTimeToUtc(
      result.departureDate,
      result.departureTime || "00:00",
      result.departureTimeZone,
    );
    result.arrivalAt = result.arrivalDate
      ? zonedDateTimeToUtc(result.arrivalDate, result.arrivalTime || "23:59", result.arrivalTimeZone)
      : null;
  } else if (collection === "reservations") {
    result.timeZone ||= tripTimeZone;
    result.startsAt = zonedDateTimeToUtc(result.date, result.time || "00:00", result.timeZone);
  } else if (collection === "reminders") {
    result.timeZone ||= tripTimeZone;
    const [date, time] = String(result.remindAt || "").split("T");
    result.remindInstant = zonedDateTimeToUtc(date, time || "00:00", result.timeZone);
  }
  return result;
}
