import { addIsoDays, duplicateOptions, resetEntityProgress, shiftEntityDates } from "./templates.js";

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}; recibido ${JSON.stringify(actual)}`);
  }
}

Deno.test("desplaza fechas de una plantilla sin alterar horas locales", () => {
  assertEquals(addIsoDays("2026-09-17T09:30", 10), "2026-09-27T09:30");
  const transport = shiftEntityDates("transports", {
    departureDate: "2026-09-17",
    arrivalDate: "2026-09-18",
    departureAt: "anterior",
  }, 5);
  assertEquals(transport.departureDate, "2026-09-22");
  assertEquals(transport.arrivalDate, "2026-09-23");
  assertEquals(transport.departureAt, undefined);
});

Deno.test("reinicia progreso y filtra colecciones de duplicación", () => {
  const purchase = resetEntityProgress("purchases", { status: "Comprado", actualPrice: 500, estimatedPrice: 600 });
  assertEquals([purchase.status, purchase.actualPrice, purchase.estimatedPrice], ["Pendiente", 0, 600]);
  const options = duplicateOptions(
    { startDate: "2027-01-10", collections: ["places", "invalid", "places"] },
    "2027-01-01",
  );
  assertEquals(options.shiftDays, 9);
  assertEquals([...options.collections], ["places"]);
});
