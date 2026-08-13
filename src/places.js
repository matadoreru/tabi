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
