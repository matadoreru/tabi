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

export function activityGoogleMapsUrl(activity, places = []) {
  if (/^https?:\/\//i.test(activity.mapsUrl || "")) return activity.mapsUrl;
  const place = places.find(({ id }) => id === activity.placeId);
  if (
    /^https?:\/\/(?:www\.)?google\.[^/]+\/maps\//i.test(place?.link || "") ||
    /^https?:\/\/maps\.app\.goo\.gl\//i.test(place?.link || "")
  ) {
    return place.link;
  }
  const hasCoordinates = place && place.lat !== "" && place.lat != null && place.lng !== "" && place.lng != null &&
    Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng));
  const query = hasCoordinates
    ? `${place.lat},${place.lng}`
    : [activity.location, activity.city].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

export function googleMapsLinkSearch(value) {
  try {
    const url = new URL(value);
    const placeIndex = url.pathname.split("/").indexOf("place");
    const pathQuery = placeIndex >= 0 ? decodeURIComponent(url.pathname.split("/")[placeIndex + 1] || "") : "";
    const coordinateMatch = url.pathname.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    return {
      placeId: url.searchParams.get("query_place_id") || "",
      query: url.searchParams.get("query") || url.searchParams.get("q") || pathQuery.replaceAll("+", " "),
      lat: coordinateMatch ? Number(coordinateMatch[1]) : null,
      lng: coordinateMatch ? Number(coordinateMatch[2]) : null,
    };
  } catch {
    return { placeId: "", query: "", lat: null, lng: null };
  }
}

export function inspirationLink(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      return { url: url.href, platform: "TikTok", key: "tiktok" };
    }
    if ((host === "instagram.com" || host.endsWith(".instagram.com")) && /^\/(?:reel|reels|p)\//.test(url.pathname)) {
      return { url: url.href, platform: "Instagram", key: "instagram" };
    }
    if (host === "youtu.be" && url.pathname.length > 1) {
      return { url: url.href, platform: "YouTube", key: "youtube" };
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const video = url.pathname === "/watch" && url.searchParams.has("v");
      const short = /^\/shorts\/[^/]+/.test(url.pathname);
      if (video || short) return { url: url.href, platform: "YouTube", key: "youtube" };
    }
  } catch {
    // Los textos compartidos pueden no contener una URL válida.
  }
  return null;
}

export function sharedInspirationLink(...values) {
  for (const value of values) {
    const matches = String(value || "").match(/https?:\/\/[^\s<>]+/g) || [];
    for (const match of matches) {
      const link = inspirationLink(match.replace(/[),.!?\]}]+$/g, ""));
      if (link) return link;
    }
  }
  return null;
}

export function budgetSummary(trip, expenses, purchases = [], funds = []) {
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
  const baseBudget = Number(trip?.budget || 0);
  const funded = funds.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const budget = baseBudget + funded;
  return {
    budget,
    baseBudget,
    funded,
    spent,
    committed,
    shoppingPlanned,
    remaining: budget - spent,
    projected: spent + committed + shoppingPlanned,
    perPerson: spent / Math.max(1, Number(trip?.travelers || 1)),
  };
}

export function fundContributorOptions(members = [], currentContributor = "") {
  const options = members.map(({ user }) => ({
    value: user.name,
    label: user.username ? `${user.name} (@${user.username})` : user.name,
  }));
  const knownContributor = options.some(({ value }) => value === currentContributor) || currentContributor === "Otros";
  if (currentContributor && !knownContributor) {
    options.push({ value: currentContributor, label: `${currentContributor} (guardado)` });
  }
  options.push({ value: "Otros", label: "Otros" });
  return options;
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
