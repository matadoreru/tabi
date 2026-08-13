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

export function normalizePlaceText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function googleMapsPlaceKey(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "maps.app.goo.gl") return `short:${host}${url.pathname.replace(/\/$/, "")}`;
    if (!/^maps\.google\.[a-z.]+$/.test(host) && !/^google\.[a-z.]+$/.test(host)) return "";
    if (!url.pathname.startsWith("/maps")) return "";

    const explicitId = url.searchParams.get("query_place_id") ||
      url.searchParams.get("q")?.match(/^place_id:(.+)$/i)?.[1];
    if (explicitId) return `place:${explicitId.toLowerCase()}`;
    const embeddedId = decodeURIComponent(url.pathname).match(/!1s([^!/?]+)/)?.[1];
    if (embeddedId) return `place:${embeddedId.toLowerCase()}`;

    const path = decodeURIComponent(url.pathname)
      .replace(/\/@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?[^/]*/g, "")
      .replace(/\/$/, "");
    const query = url.searchParams.get("query") || url.searchParams.get("q") || "";
    return `google:${normalizePlaceText(`${path} ${query}`)}`;
  } catch {
    return "";
  }
}

export function findPlaceDuplicate(candidate, places, excludedId = "") {
  const name = normalizePlaceText(candidate?.name);
  const city = normalizePlaceText(candidate?.city);
  const linkKey = googleMapsPlaceKey(candidate?.link);
  for (const place of places || []) {
    if (place.id === excludedId) continue;
    if (linkKey && linkKey === googleMapsPlaceKey(place.link)) return { place, reason: "link" };
    if (name && city && name === normalizePlaceText(place.name) && city === normalizePlaceText(place.city)) {
      return { place, reason: "name" };
    }
  }
  return null;
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

export function stayBudgetAmounts(stay) {
  if (stay?.bookingStatus === "Cancelada") return { paid: 0, pending: 0, total: 0 };
  const total = Math.max(0, Number(stay?.price || 0));
  const enteredPaid = Math.max(0, Number(stay?.paidAmount || 0));
  // Los alojamientos antiguos solo guardaban el estado, no el importe abonado.
  const paid = stay?.paymentStatus === "Pagado" ? total : Math.min(total, enteredPaid);
  return { paid, pending: Math.max(0, total - paid), total };
}

export function transportBudgetAmounts(transport) {
  if (transport?.status === "Cancelado") return { paid: 0, pending: 0, total: 0 };
  const total = Math.max(0, Number(transport?.price || 0));
  const enteredPaid = Math.max(0, Number(transport?.paidAmount || 0));
  const legacyCompleted = transport?.status === "Realizado" && transport?.paymentStatus === undefined;
  const paid = transport?.paymentStatus === "Pagado" || legacyCompleted ? total : Math.min(total, enteredPaid);
  return { paid, pending: Math.max(0, total - paid), total };
}

export function budgetSummary(trip, expenses, purchases = [], funds = [], stays = [], transports = []) {
  const expenseSpent = expenses.reduce((sum, item) => sum + Number(item.actualAmount || 0), 0);
  // Un precio real indica una compra efectuada aunque un dato importado conserve un estado antiguo.
  const shoppingSpent = purchases.reduce((sum, item) => sum + Math.max(0, Number(item.actualPrice || 0)), 0);
  const lodging = stays.reduce((result, stay) => {
    const amounts = stayBudgetAmounts(stay);
    result.spent += amounts.paid;
    result.committed += amounts.pending;
    result.total += amounts.total;
    return result;
  }, { spent: 0, committed: 0, total: 0 });
  const transportation = transports.reduce((result, transport) => {
    const amounts = transportBudgetAmounts(transport);
    result.spent += amounts.paid;
    result.committed += amounts.pending;
    result.total += amounts.total;
    return result;
  }, { spent: 0, committed: 0, total: 0 });
  const spent = expenseSpent + shoppingSpent + lodging.spent + transportation.spent;
  const expenseCommitted = expenses.reduce(
    (sum, item) => sum + Math.max(0, Number(item.estimatedAmount || 0) - Number(item.actualAmount || 0)),
    0,
  );
  const committed = expenseCommitted + lodging.committed + transportation.committed;
  const shoppingPlanned = purchases.filter((item) =>
    item.status !== "Comprado" && item.status !== "No encontrado" && Number(item.actualPrice || 0) <= 0
  )
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
    lodgingSpent: lodging.spent,
    lodgingCommitted: lodging.committed,
    lodgingTotal: lodging.total,
    transportSpent: transportation.spent,
    transportCommitted: transportation.committed,
    transportTotal: transportation.total,
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

export function stayNights(stay) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(stay?.checkInDate || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(stay?.checkOutDate || "")
  ) return 0;
  const start = Date.parse(`${stay.checkInDate}T00:00:00Z`);
  const end = Date.parse(`${stay.checkOutDate}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86400000));
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
