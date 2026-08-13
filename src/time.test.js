import { attachTemporalInstants, isValidTimeZone, zonedDateTimeToUtc } from "./time.js";
import { calendarEvents, exportTripIcs } from "./calendar.js";

function assertEquals(actual, expected) {
  if (actual !== expected) throw new Error(`Esperado ${expected}; recibido ${actual}`);
}

Deno.test("convierte una hora local a UTC conservando la zona y el DST", () => {
  assertEquals(isValidTimeZone("Asia/Tokyo"), true);
  assertEquals(zonedDateTimeToUtc("2026-09-17", "09:30", "Asia/Tokyo"), "2026-09-17T00:30:00.000Z");
  assertEquals(zonedDateTimeToUtc("2026-07-01", "10:00", "Europe/Madrid"), "2026-07-01T08:00:00.000Z");
  assertEquals(zonedDateTimeToUtc("2026-03-29", "02:30", "Europe/Madrid"), null);
});

Deno.test("calcula instantes distintos para un transporte entre zonas", () => {
  const item = attachTemporalInstants("transports", {
    departureDate: "2026-09-17",
    departureTime: "10:00",
    departureTimeZone: "Europe/Madrid",
    arrivalDate: "2026-09-18",
    arrivalTime: "08:00",
    arrivalTimeZone: "Asia/Tokyo",
  });
  assertEquals(item.departureAt, "2026-09-17T08:00:00.000Z");
  assertEquals(item.arrivalAt, "2026-09-17T23:00:00.000Z");
});

Deno.test("los recordatorios conservan hora local e instante UTC", () => {
  const reminder = attachTemporalInstants(
    "reminders",
    { remindAt: "2026-09-17T09:00", title: "Salir" },
    "Asia/Tokyo",
  );
  assertEquals(reminder.remindAt, "2026-09-17T09:00");
  assertEquals(reminder.remindInstant, "2026-09-17T00:00:00.000Z");
});

Deno.test("exporta un calendario compatible con actividades y transportes", () => {
  const payload = {
    trip: { id: "trip_1", name: "Japón", timeZone: "Asia/Tokyo" },
    activities: [{ id: "act_1", title: "Templo, Tokio", date: "2026-09-17", start: "09:00", end: "10:00" }],
    transports: [],
  };
  assertEquals(calendarEvents(payload)[0].startAt, "2026-09-17T00:00:00.000Z");
  const ics = exportTripIcs(payload);
  if (
    !ics.includes("BEGIN:VCALENDAR") || !ics.includes("SUMMARY:Templo\\, Tokio") ||
    !ics.includes("UID:act_1@tabi/trip_1")
  ) throw new Error("ICS incompleto");
});
