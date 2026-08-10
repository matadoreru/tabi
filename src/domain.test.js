import {
  activityGoogleMapsUrl,
  budgetSummary,
  fundContributorOptions,
  googleMapsLinkSearch,
  haversineKm,
  inspirationLink,
  itineraryAnalysis,
  minutes,
  sharedInspirationLink,
} from "./domain.js";

function assertEquals(actual, expected) {
  if (actual !== expected) throw new Error(`Esperado ${expected}; recibido ${actual}`);
}

function assertAlmostEquals(actual, expected, tolerance) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Esperado ${expected} ± ${tolerance}; recibido ${actual}`);
  }
}

Deno.test("convierte horas a minutos", () => assertEquals(minutes("09:45"), 585));
Deno.test("detecta actividades solapadas", () => {
  const result = itineraryAnalysis([{ id: "a", start: "09:00", end: "10:30" }, {
    id: "b",
    start: "10:00",
    end: "11:00",
  }]);
  assertEquals(result.conflicts[0].overlap, 30);
});
Deno.test("crea una búsqueda de Google Maps para el lugar de una actividad", () => {
  assertEquals(
    activityGoogleMapsUrl({ location: "Sensō-ji", city: "Tokio" }),
    "https://www.google.com/maps/search/?api=1&query=Sens%C5%8D-ji%2C%20Tokio",
  );
});
Deno.test("usa las coordenadas del lugar guardado para abrir Google Maps", () => {
  assertEquals(
    activityGoogleMapsUrl({ placeId: "place-1" }, [{ id: "place-1", lat: 35.7148, lng: 139.7967 }]),
    "https://www.google.com/maps/search/?api=1&query=35.7148%2C139.7967",
  );
});
Deno.test("extrae la búsqueda y coordenadas de un enlace de Google Maps", () => {
  const result = googleMapsLinkSearch("https://www.google.com/maps/place/Sens%C5%8D-ji/@35.7148,139.7967,17z");
  assertEquals(result.query, "Sensō-ji");
  assertEquals(result.lat, 35.7148);
  assertEquals(result.lng, 139.7967);
});
Deno.test("reconoce enlaces de inspiración compatibles", () => {
  assertEquals(inspirationLink("https://www.tiktok.com/@tabi/video/123")?.platform, "TikTok");
  assertEquals(inspirationLink("https://www.instagram.com/reel/ABC123/")?.platform, "Instagram");
  assertEquals(inspirationLink("https://youtube.com/shorts/ABC123")?.platform, "YouTube");
  assertEquals(inspirationLink("https://example.com/video"), null);
});
Deno.test("extrae el enlace cuando Android lo comparte dentro del texto", () => {
  const link = sharedInspirationLink("Mira este vídeo https://youtu.be/ABC123?si=example");
  assertEquals(link?.url, "https://youtu.be/ABC123?si=example");
});
Deno.test("calcula presupuesto con compras realizadas", () => {
  const result = budgetSummary({ budget: 1000, travelers: 2 }, [{ actualAmount: 200, estimatedAmount: 300 }], [{
    status: "Comprado",
    actualPrice: 50,
  }]);
  assertEquals(result.spent, 250);
  assertEquals(result.remaining, 750);
  assertEquals(result.perPerson, 125);
});
Deno.test("suma fondos aportados al presupuesto base", () => {
  const result = budgetSummary({ budget: 1000, travelers: 2 }, [{ actualAmount: 200 }], [], [{ amount: 500 }]);
  assertEquals(result.budget, 1500);
  assertEquals(result.funded, 500);
  assertEquals(result.remaining, 1300);
});
Deno.test("ofrece los miembros del viaje y Otros como aportantes", () => {
  const options = fundContributorOptions([
    { user: { name: "Ana", username: "ana" } },
    { user: { name: "Luis", username: "luis" } },
  ]);
  assertEquals(
    JSON.stringify(options),
    JSON.stringify([
      { value: "Ana", label: "Ana (@ana)" },
      { value: "Luis", label: "Luis (@luis)" },
      { value: "Otros", label: "Otros" },
    ]),
  );
});
Deno.test("conserva un aportante antiguo al editar", () => {
  const options = fundContributorOptions([{ user: { name: "Ana", username: "ana" } }], "Invitado");
  assertEquals(options[1].value, "Invitado");
  assertEquals(options[2].value, "Otros");
});
Deno.test("calcula distancia geográfica", () =>
  assertAlmostEquals(haversineKm({ lat: 35.7148, lng: 139.7967 }, { lat: 35.7101, lng: 139.7957 }), 0.53, 0.05));
