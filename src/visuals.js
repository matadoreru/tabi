const definitions = {
  todos: ["Todos", "✦", "blue"],
  pendiente: ["Pendiente", "⏳", "amber"],
  planeado: ["Planeado", "🗓️", "blue"],
  visitado: ["Visitado", "📍", "green"],
  realizado: ["Realizado", "🏁", "green"],
  realizada: ["Realizada", "🏁", "green"],
  completada: ["Completada", "☑️", "green"],
  completado: ["Completado", "☑️", "green"],
  pagado: ["Pagado", "💳", "green"],
  comprado: ["Comprado", "🛍️", "green"],
  confirmada: ["Confirmada", "🔒", "green"],
  confirmado: ["Confirmado", "🔒", "green"],
  activa: ["Activa", "⚡", "green"],
  encontrado: ["Encontrado", "🔎", "blue"],
  visto: ["Visto", "👁️", "green"],
  vistos: ["Vistos", "👁️", "green"],
  "no visto": ["No visto", "◯", "amber"],
  "no vistos": ["No vistos", "◯", "amber"],
  sincronizado: ["Sincronizado", "🔄", "blue"],
  parcial: ["Parcial", "🌓", "amber"],
  "por reservar": ["Por reservar", "🕒", "amber"],
  descartado: ["Descartado", "🚫", "red"],
  cancelada: ["Cancelada", "⛔", "red"],
  cancelado: ["Cancelado", "⛔", "red"],
  revocada: ["Revocada", "🔓", "red"],
  expirada: ["Expirada", "⌛", "amber"],
  consumida: ["Consumida", "✓", "green"],
  "no encontrado": ["No encontrado", "❌", "red"],
  imprescindible: ["Imprescindible", "⭐", "red"],
  alta: ["Alta", "⬆️", "red"],
  media: ["Media", "➡️", "amber"],
  baja: ["Baja", "⬇️", "green"],
  hotel: ["Hotel", "🏨", "blue"],
  restaurante: ["Restaurante", "🍜", "blue"],
  museo: ["Museo", "🏛️", "blue"],
  actividad: ["Actividad", "🎯", "blue"],
  entrada: ["Entrada", "🎟️", "blue"],
};

export const STATUS_VISUALS = Object.freeze(
  Object.fromEntries(
    Object.entries(definitions).map(([key, [label, icon, tone]]) => [key, Object.freeze({ label, icon, tone })]),
  ),
);

export function statusVisual(value = "") {
  const key = String(value).trim().toLocaleLowerCase("es");
  return STATUS_VISUALS[key] || STATUS_VISUALS[key.split(/\s*[·—]\s*/)[0]] || null;
}
