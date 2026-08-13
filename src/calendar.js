import { attachTemporalInstants, DEFAULT_TIME_ZONE } from "./time.js";

const escapeIcs = (value = "") =>
  String(value).replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
const stamp = (value) => new Date(value).toISOString().replaceAll(/[-:]/g, "").replace(".000", "");
const dateStamp = (value) => String(value || "").replaceAll("-", "");

function fold(line) {
  const chunks = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 73) {
    let end = Math.min(73, rest.length);
    while (new TextEncoder().encode(rest.slice(0, end)).length > 73) end--;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

function eventLines(event, tripId) {
  const lines = ["BEGIN:VEVENT", `UID:${escapeIcs(`${event.id}@tabi/${tripId}`)}`, `DTSTAMP:${stamp(new Date())}`];
  if (event.startAt) lines.push(`DTSTART:${stamp(event.startAt)}`);
  else lines.push(`DTSTART;VALUE=DATE:${dateStamp(event.date)}`);
  if (event.endAt) lines.push(`DTEND:${stamp(event.endAt)}`);
  else if (event.endDate) lines.push(`DTEND;VALUE=DATE:${dateStamp(event.endDate)}`);
  lines.push(`SUMMARY:${escapeIcs(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  if (event.url) lines.push(`URL:${escapeIcs(event.url)}`);
  lines.push("END:VEVENT");
  return lines;
}

export function calendarEvents(payload) {
  const zone = payload.trip?.timeZone || DEFAULT_TIME_ZONE;
  const activities = (payload.activities || []).map((item) => {
    const temporal = attachTemporalInstants("activities", item, zone);
    return {
      id: item.id,
      title: item.title,
      startAt: temporal.startsAt,
      endAt: temporal.endsAt,
      date: item.date,
      location: item.location || item.city,
      description: item.notes,
      url: item.mapsUrl,
    };
  });
  const stays = (payload.stays || []).map((item) => {
    const temporal = attachTemporalInstants("stays", item, zone);
    return {
      id: item.id,
      title: `Alojamiento · ${item.name}`,
      startAt: temporal.checkInAt,
      endAt: temporal.checkOutAt,
      date: item.checkInDate,
      endDate: item.checkOutDate,
      location: item.address || item.city,
      description: item.notes,
      url: item.link,
    };
  });
  const transports = (payload.transports || []).map((item) => {
    const temporal = attachTemporalInstants("transports", item, zone);
    return {
      id: item.id,
      title: `${item.type || "Transporte"} · ${item.origin} → ${item.destination}`,
      startAt: temporal.departureAt,
      endAt: temporal.arrivalAt,
      date: item.departureDate,
      location: item.origin,
      description: [item.operator, item.reservation, item.notes].filter(Boolean).join(" · "),
      url: item.link,
    };
  });
  const reservations = (payload.reservations || []).map((item) => {
    const temporal = attachTemporalInstants("reservations", item, zone);
    return {
      id: item.id,
      title: `Reserva · ${item.title}`,
      startAt: temporal.startsAt,
      date: item.date,
      description: [item.reference, item.notes].filter(Boolean).join(" · "),
      url: item.link,
    };
  });
  return [...activities, ...stays, ...transports, ...reservations];
}

export function exportTripIcs(payload) {
  const events = calendarEvents(payload);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tabi//Travel Planner//ES",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcs(payload.trip?.name || "Tabi")}`,
    ...events.flatMap((event) => eventLines(event, payload.trip?.id || "trip")),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
