export const PLACE_METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function placeMetadataIsStale(place, at = Date.now()) {
  const updated = Date.parse(place?.googlePlaceUpdatedAt || place?.photoCheckedAt || "");
  return Boolean(place?.googlePlaceId) && (!Number.isFinite(updated) || at - updated >= PLACE_METADATA_TTL_MS);
}

export function googlePlaceMetadata(place, photo = {}, at = new Date()) {
  return {
    googlePlaceId: place?.id || "",
    googlePlaceUpdatedAt: at.toISOString(),
    googlePrimaryType: place?.primaryType || "",
    googlePhotoName: photo.photoName || "",
    ...photo,
  };
}

export function itineraryRoutePairs(items) {
  const located = [...items].sort((a, b) => String(a.start).localeCompare(String(b.start))).filter((item) =>
    Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))
  );
  return located.slice(1).map((destination, index) => ({ origin: located[index], destination }));
}

function squaredDistance(a, b) {
  const latitude = (Number(a.lat) - Number(b.lat)) * Math.cos((Number(a.lat) + Number(b.lat)) * Math.PI / 360);
  const longitude = Number(a.lng) - Number(b.lng);
  return latitude * latitude + longitude * longitude;
}

/** Returns the activities in a short greedy route while preserving their existing time slots. */
export function optimizedActivitySlots(items) {
  const sorted = [...items].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  if (
    sorted.length < 3 || sorted.some((item) => !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng)))
  ) {
    return [];
  }
  const remaining = sorted.slice(1);
  const ordered = [sorted[0]];
  while (remaining.length) {
    const previous = ordered.at(-1);
    remaining.sort((a, b) => squaredDistance(previous, a) - squaredDistance(previous, b));
    ordered.push(remaining.shift());
  }
  return ordered.map((item, index) => ({ item, start: sorted[index].start, end: sorted[index].end }));
}
