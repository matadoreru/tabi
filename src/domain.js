export const minutes = (time = "00:00") => {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
};

export const durationLabel = (value = 0) => {
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? `${hours} h${mins ? ` ${mins} min` : ""}` : `${mins} min`;
};

export function itineraryAnalysis(activities) {
  const sorted = [...activities].sort((a, b) => minutes(a.start) - minutes(b.start));
  const conflicts = [];
  const gaps = [];
  sorted.forEach((activity, index) => {
    const next = sorted[index + 1];
    if (!next) return;
    const available = minutes(next.start) - minutes(activity.end);
    if (available < 0) conflicts.push({ first: activity, second: next, overlap: Math.abs(available) });
    else gaps.push({ first: activity, second: next, available });
  });
  const plannedMinutes = sorted.reduce((sum, item) => sum + Math.max(0, minutes(item.end) - minutes(item.start)), 0);
  const distinctAreas = new Set(sorted.map((item) => item.location).filter(Boolean)).size;
  const warnings = [];
  if (plannedMinutes > 600) warnings.push("Día muy cargado: más de 10 horas planificadas.");
  if (sorted.length > 7) warnings.push("Muchas paradas: considera reducir o agrupar actividades.");
  if (distinctAreas > 5) warnings.push("Demasiados cambios de zona pueden aumentar los desplazamientos.");
  return { sorted, conflicts, gaps, plannedMinutes, warnings };
}

export function budgetSummary(trip, expenses, purchases = []) {
  const spent = expenses.reduce((sum, item) => sum + Number(item.actualAmount || 0), 0) +
    purchases.filter((item) => item.status === "Comprado").reduce(
      (sum, item) => sum + Number(item.actualPrice || 0),
      0,
    );
  const committed = expenses.reduce(
    (sum, item) => sum + Math.max(0, Number(item.estimatedAmount || 0) - Number(item.actualAmount || 0)),
    0,
  );
  const shoppingPlanned = purchases.filter((item) => item.status !== "Comprado" && item.status !== "No encontrado")
    .reduce((sum, item) => sum + Number(item.estimatedPrice || 0), 0);
  const budget = Number(trip?.budget || 0);
  return {
    budget,
    spent,
    committed,
    shoppingPlanned,
    remaining: budget - spent,
    projected: spent + committed + shoppingPlanned,
    perPerson: spent / Math.max(1, Number(trip?.travelers || 1)),
  };
}

export function groupTotals(items, key, amountKey = "actualAmount") {
  return Object.entries(items.reduce((result, item) => {
    const label = item[key] || "Sin asignar";
    result[label] = (result[label] || 0) + Number(item[amountKey] || 0);
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
}

export function dateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function haversineKm(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return null;
  const radius = 6371;
  const rad = (value) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function nearbyPlaces(place, places, radiusKm = 3) {
  return places.map((candidate) => ({ ...candidate, distance: haversineKm(place, candidate) })).filter((candidate) =>
    candidate.id !== place.id && candidate.distance !== null && candidate.distance <= radiusKm
  ).sort((a, b) => a.distance - b.distance);
}
