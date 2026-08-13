const DATE_FIELDS = Object.freeze({
  activities: ["date"],
  places: ["assignedDate"],
  tasks: ["dueDate"],
  purchases: ["purchaseDate"],
  expenses: ["date"],
  funds: ["date"],
  stays: ["checkInDate", "checkOutDate", "cancellationDeadline"],
  transports: ["departureDate", "arrivalDate"],
  reservations: ["date"],
  reminders: ["remindAt"],
  proposals: ["date"],
  availabilities: ["startAt", "endAt"],
  journalEntries: ["date"],
});

export const DUPLICABLE_COLLECTIONS = Object.freeze([
  "activities",
  "places",
  "tasks",
  "purchases",
  "expenses",
  "funds",
  "stays",
  "transports",
  "reservations",
  "inspirations",
  "notes",
  "reminders",
  "proposals",
  "availabilities",
  "journalEntries",
  "emergencyContacts",
]);

export const DEFAULT_TEMPLATE_COLLECTIONS = Object.freeze([
  "activities",
  "places",
  "tasks",
  "purchases",
  "stays",
  "transports",
  "reservations",
  "inspirations",
  "notes",
  "reminders",
  "proposals",
  "availabilities",
  "emergencyContacts",
]);

export function addIsoDays(value, days) {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return value;
  const [date, suffix = ""] = String(value).split("T");
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return `${instant.toISOString().slice(0, 10)}${suffix ? `T${suffix}` : ""}`;
}

export function dayOffset(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function shiftEntityDates(collection, source, days) {
  const result = structuredClone(source);
  for (const field of DATE_FIELDS[collection] || []) {
    if (result[field]) result[field] = addIsoDays(result[field], days);
  }
  for (const field of ["startsAt", "endsAt", "checkInAt", "checkOutAt", "departureAt", "arrivalAt", "remindInstant"]) {
    delete result[field];
  }
  return result;
}

export function resetEntityProgress(collection, source) {
  const item = structuredClone(source);
  if (collection === "activities") item.status = "planned";
  if (collection === "places" && !["Descartado"].includes(item.status)) item.status = "Pendiente";
  if (collection === "tasks") item.status = "Pendiente";
  if (collection === "purchases") {
    item.status = "Pendiente";
    item.actualPrice = 0;
    delete item.actualPriceMoney;
    delete item.purchaseDate;
  }
  if (["stays", "reservations"].includes(collection)) item.bookingStatus = "Pendiente";
  if (["stays", "transports", "reservations"].includes(collection)) {
    item.paymentStatus = "Pendiente";
    item.paidAmount = 0;
    delete item.paidAmountMoney;
  }
  if (collection === "transports") item.status = "Por reservar";
  if (collection === "reservations") item.status = "Pendiente";
  if (collection === "reminders") item.status = "pending";
  if (collection === "proposals") {
    item.status = "Abierta";
    item.votes = {};
  }
  return item;
}

export function duplicateOptions(input = {}, sourceStartDate) {
  const selected = Array.isArray(input.collections)
    ? [...new Set(input.collections.filter((name) => DUPLICABLE_COLLECTIONS.includes(name)))]
    : [...DUPLICABLE_COLLECTIONS];
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate || "") ? input.startDate : sourceStartDate;
  return {
    name: String(input.name || "").trim(),
    startDate,
    shiftDays: dayOffset(sourceStartDate, startDate),
    collections: new Set(selected),
    resetProgress: input.resetProgress !== false,
    asTemplate: Boolean(input.asTemplate),
  };
}
