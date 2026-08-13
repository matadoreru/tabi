import {
  activityGoogleMapsUrl,
  budgetSummary,
  findPlaceDuplicate,
  fundContributorOptions,
  googleMapsLinkSearch,
  googleMapsPlaceKey,
  haversineKm,
  inspirationLink,
  itineraryAnalysis,
  minutes,
  sharedInspirationLink,
  stayBudgetAmounts,
  stayNights,
} from "./domain.js";
import {
  convertCurrency,
  currencyDefinition,
  formatCurrency,
  moneyAmounts,
  rateKey,
  tripCurrencyConfig,
} from "./currency.js";

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
Deno.test("detecta lugares duplicados por nombre normalizado y ciudad", () => {
  const duplicate = findPlaceDuplicate(
    { name: "  Senso ji ", city: "TOKIO" },
    [{ id: "place-1", name: "Sensō-ji", city: "Tokio" }],
  );
  assertEquals(duplicate?.place.id, "place-1");
  assertEquals(duplicate?.reason, "name");
});
Deno.test("identifica el mismo lugar de Maps aunque cambien parámetros de idioma", () => {
  assertEquals(
    googleMapsPlaceKey("https://www.google.com/maps/place/Senso-ji/@35.7,139.7,17z?hl=es"),
    googleMapsPlaceKey("https://maps.google.es/maps/place/Senso-ji/@35.7,139.7,15z?hl=ja"),
  );
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
Deno.test("una compra con precio pagado cuenta aunque conserve un estado anterior", () => {
  const result = budgetSummary({ budget: 1000 }, [], [{ status: "Pendiente", actualPrice: 125 }]);
  assertEquals(result.spent, 125);
  assertEquals(result.shoppingPlanned, 0);
});
Deno.test("incluye alojamientos pagados y pendientes en el presupuesto", () => {
  const result = budgetSummary(
    { budget: 2000, travelers: 2 },
    [],
    [],
    [],
    [
      { price: 600, paymentStatus: "Pagado", bookingStatus: "Confirmada" },
      { price: 800, paidAmount: 300, paymentStatus: "Parcial", bookingStatus: "Confirmada" },
      { price: 900, paymentStatus: "Pagado", bookingStatus: "Cancelada" },
    ],
  );
  assertEquals(result.spent, 900);
  assertEquals(result.committed, 500);
  assertEquals(result.lodgingTotal, 1400);
  assertEquals(result.remaining, 1100);
});
Deno.test("mantiene compatibles los alojamientos pagados sin paidAmount", () => {
  const result = stayBudgetAmounts({ price: 450, paymentStatus: "Pagado" });
  assertEquals(result.paid, 450);
  assertEquals(result.pending, 0);
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
Deno.test("calcula las noches de un alojamiento sin depender del cambio horario", () => {
  assertEquals(stayNights({ checkInDate: "2026-10-10", checkOutDate: "2026-10-13" }), 3);
  assertEquals(stayNights({ checkInDate: "", checkOutDate: "2026-10-13" }), 0);
});

Deno.test("centraliza formato, precisión y conversión de monedas", () => {
  assertEquals(currencyDefinition("JPY").digits, 0);
  assertEquals(currencyDefinition("EUR").digits, 2);
  assertEquals(formatCurrency(12500, "JPY").includes("12.500"), true);
  assertAlmostEquals(convertCurrency(100, "USD", "EUR", { "USD:EUR": 0.9 }), 90, 0.0001);
});

Deno.test("conserva el importe original al cambiar la moneda principal", () => {
  const config = tripCurrencyConfig(
    { currency: "USD", secondaryCurrency: "EUR", exchangeRateMode: "automatic" },
    { [rateKey("JPY", "USD")]: 0.0068, [rateKey("USD", "EUR")]: 0.91 },
  );
  const amounts = moneyAmounts(12500, "JPY", config);
  assertAlmostEquals(amounts.primaryAmount, 85, 0.0001);
  assertAlmostEquals(amounts.secondaryAmount, 77.35, 0.0001);
});
