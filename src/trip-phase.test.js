import { TRIP_PHASES, tripPhase, tripPhaseCopy } from "./trip-phase.js";

function assertEquals(actual, expected) {
  if (actual !== expected) throw new Error(`Esperado ${expected}; recibido ${actual}`);
}

Deno.test("clasifica el viaje antes, durante y después incluyendo límites", () => {
  const trip = { startDate: "2026-09-17", endDate: "2026-09-20" };
  assertEquals(tripPhase(trip, "2026-09-16"), TRIP_PHASES.BEFORE);
  assertEquals(tripPhase(trip, "2026-09-17"), TRIP_PHASES.DURING);
  assertEquals(tripPhase(trip, "2026-09-20"), TRIP_PHASES.DURING);
  assertEquals(tripPhase(trip, "2026-09-21"), TRIP_PHASES.AFTER);
  assertEquals(tripPhaseCopy(TRIP_PHASES.AFTER, { totalDays: 4 }).metric, "4 días");
});
