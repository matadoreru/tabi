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

Deno.test("desplaza disponibilidad y reinicia las votaciones de una plantilla", () => {
  assertEquals(
    shiftEntityDates("availabilities", {
      startAt: "2026-09-17T08:00",
      endAt: "2026-09-18T12:00",
    }, 3),
    { startAt: "2026-09-20T08:00", endAt: "2026-09-21T12:00" },
  );
  assertEquals(resetEntityProgress("proposals", { status: "Aceptada", votes: { a: "yes" } }), {
    status: "Abierta",
    votes: {},
  });
});
