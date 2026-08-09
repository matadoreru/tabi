import { budgetSummary, haversineKm, itineraryAnalysis, minutes } from "./domain.js";

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
Deno.test("calcula distancia geográfica", () =>
  assertAlmostEquals(haversineKm({ lat: 35.7148, lng: 139.7967 }, { lat: 35.7101, lng: 139.7957 }), 0.53, 0.05));
