export const TRIP_PHASES = Object.freeze({ BEFORE: "before", DURING: "during", AFTER: "after" });

export function tripPhase(trip, today) {
  if (today < trip.startDate) return TRIP_PHASES.BEFORE;
  if (today > trip.endDate) return TRIP_PHASES.AFTER;
  return TRIP_PHASES.DURING;
}

export function tripPhaseCopy(phase, context = {}) {
  if (phase === TRIP_PHASES.BEFORE) {
    return { eyebrow: "Próxima aventura", metric: `${context.daysUntil ?? 0} días`, metricLabel: "para despegar" };
  }
  if (phase === TRIP_PHASES.DURING) {
    return {
      eyebrow: `Día ${context.day ?? 1} de ${context.totalDays ?? 1}`,
      metric: "En viaje",
      metricLabel: "disfruta el día",
    };
  }
  return { eyebrow: "Viaje completado", metric: `${context.totalDays ?? 1} días`, metricLabel: "para recordar" };
}
