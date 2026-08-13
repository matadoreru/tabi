import { googlePlaceMetadata, itineraryRoutePairs, optimizedActivitySlots, placeMetadataIsStale } from "./places.js";

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

Deno.test("propone un orden cercano sin alterar los huecos horarios", () => {
  const result = optimizedActivitySlots([
    { id: "a", start: "09:00", end: "10:00", lat: 0, lng: 0 },
    { id: "b", start: "10:00", end: "11:00", lat: 0, lng: 10 },
    { id: "c", start: "11:00", end: "12:00", lat: 0, lng: 1 },
  ]);
  if (result.map(({ item }) => item.id).join("") !== "acb") throw new Error("Orden inesperado.");
  if (result.map(({ start }) => start).join(",") !== "09:00,10:00,11:00") throw new Error("Cambió los huecos.");
});
