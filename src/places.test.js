import { googlePlaceMetadata, itineraryRoutePairs, placeMetadataIsStale } from "./places.js";

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}; recibido ${JSON.stringify(actual)}`);
  }
}

Deno.test("caduca metadatos de Places sin invalidar lugares manuales", () => {
  const now = Date.parse("2026-08-13T00:00:00Z");
  assertEquals(
    placeMetadataIsStale({ googlePlaceId: "abc", googlePlaceUpdatedAt: "2026-06-01T00:00:00Z" }, now),
    true,
  );
  assertEquals(placeMetadataIsStale({ googlePlaceUpdatedAt: "2020-01-01T00:00:00Z" }, now), false);
  assertEquals(
    googlePlaceMetadata({ id: "place-id", primaryType: "museum" }, { photoName: "photo/1" }, new Date(now))
      .googlePrimaryType,
    "museum",
  );
});

Deno.test("crea trayectos solo entre actividades geolocalizadas", () => {
  const pairs = itineraryRoutePairs([
    { id: "b", start: "11:00", lat: 2, lng: 2 },
    { id: "x", start: "10:00" },
    { id: "a", start: "09:00", lat: 1, lng: 1 },
  ]);
  assertEquals(pairs.map(({ origin, destination }) => [origin.id, destination.id]), [["a", "b"]]);
});
