export const NAVIGATION = Object.freeze([
  ["dashboard", "Dashboard", "dashboard"],
  ["itinerary", "Itinerario", "calendar"],
  ["map", "Mapa", "map"],
  ["places", "Lugares", "pin"],
  ["reservations", "Reservas", "ticket"],
  ["stays", "Hospedaje", "bed"],
  ["transport", "Transporte", "train"],
  ["budget", "Presupuesto", "wallet"],
  ["purchases", "Compras", "bag"],
  ["tasks", "TODO", "check"],
  ["notes", "Notas", "note"],
  ["inspiration", "Inspiración", "play"],
  ["settings", "Configuración", "settings"],
]);

export const ROUTE_DESCRIPTIONS = Object.freeze({
  dashboard: "Todo lo importante, de un vistazo",
  itinerary: "Organiza cada día sin prisas ni solapamientos",
  map: "Explora tus lugares y agrúpalos por zonas",
  places: "Tu colección de sitios por descubrir",
  purchases: "Caprichos, regalos y encargos bajo control",
  tasks: "Una lista clara de todo lo que queda por hacer",
  notes: "Ideas y apuntes del viaje, siempre a mano",
  budget: "Previsión y gasto real en un mismo sitio",
  stays: "Tus alojamientos y check-ins",
  transport: "Todos tus trayectos, conectados",
  reservations: "Referencias y horarios siempre a mano",
  inspiration: "Vídeos e ideas que quieres recordar para este viaje",
  settings: "Personaliza el viaje y protege tus datos",
});

export const ROUTE_LABELS = Object.freeze(Object.fromEntries(NAVIGATION.map(([key, label]) => [key, label])));
