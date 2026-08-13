import { CATEGORIES } from "./data.js";
import {
  alternateCurrency,
  convertCurrency,
  currencyDefinition,
  currencyOptions,
  rateKey,
  tripCurrencyConfig,
} from "./currency.js";
import { countryOptions, TRIP_EMOJIS } from "./countries.js";
import { PLACE_BACKGROUND_MODES, resolvePlaceBackground } from "./backgrounds.js";
import {
  activityGoogleMapsUrl,
  budgetSummary,
  dateRange,
  durationLabel,
  findPlaceDuplicate,
  fundContributorOptions,
  googleMapsLinkSearch,
  groupTotals,
  inspirationLink,
  itineraryAnalysis,
  sharedInspirationLink,
  stayBudgetAmounts,
  stayNights,
  transportBudgetAmounts,
} from "./domain.js";
import { EMOJI_GROUPS } from "./emojis.js";
import { Store } from "./store.js";
import {
  badge,
  emptyState,
  esc,
  formatDate,
  formatMoney,
  fullDate,
  icon,
  modal,
  moneyPair,
  searchKey,
  toast,
  visualLabel,
} from "./ui.js";
import { apiClient, ApiError } from "./api-client.js";
import { session } from "./session.js";
import { PERMISSIONS, ROLE_LABELS } from "./permissions.js";
import { initializeImageLightbox } from "./lightbox.js";

const store = new Store();
const MONEY_OPTIONS = currencyOptions();
const app = document.querySelector("#app");
const ui = {
  route: location.hash.slice(1) || "dashboard",
  query: "",
  selectedDate: "",
  itineraryView: "day",
  mapPlaceId: "",
  mapSidebarOpen: false,
  filter: "Todos",
  authMode: "login",
  inspirationStatus: "Todos",
  commitSha: "",
  busy: false,
};

const NAV = [
  ["dashboard", "Dashboard", "dashboard"],
  ["itinerary", "Itinerario", "calendar"],
  ["map", "Mapa", "map"],
  ["places", "Lugares", "pin"],
  ["purchases", "Compras", "bag"],
  ["tasks", "TODO", "check"],
  ["notes", "Notas", "note"],
  ["budget", "Presupuesto", "wallet"],
  ["stays", "Hospedaje", "bed"],
  ["transport", "Transporte", "train"],
  ["reservations", "Reservas", "ticket"],
  ["inspiration", "Inspiración", "play"],
  ["settings", "Configuración", "settings"],
];
const ROUTES = Object.fromEntries(NAV.map(([key, label]) => [key, label]));
const DESCRIPTIONS = {
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
};

const fields = {
  activity: [
    { name: "title", label: "Actividad", required: true, placeholder: "Ej. Visita a Kiyomizu-dera", full: true },
    {
      name: "activityKind",
      label: "¿Qué vas a hacer?",
      type: "select",
      options: [
        { value: "General", label: "Actividad general" },
        { value: "Lugar", label: "Ir a un lugar guardado" },
        { value: "Hospedaje", label: "Ir a un hospedaje" },
        { value: "Transporte", label: "Tomar un transporte" },
      ],
      full: true,
    },
    { name: "date", label: "Fecha", type: "date", required: true },
    {
      name: "type",
      label: "Categoría",
      type: "select",
      options: [
        "Visita",
        "Comida",
        "Hospedaje",
        { value: "Trayecto", label: "Trayecto (tren, vuelo…)" },
        "Transporte",
        "Compras",
        "Check-in",
        "Vuelo",
        "Actividad",
        "Otro",
      ],
    },
    {
      name: "stayId",
      label: "Hospedaje guardado",
      type: "select",
      empty: "Selecciona un hospedaje",
      options: () =>
        store.collection("stays").map((stay) => ({
          value: stay.id,
          label: `${stay.name}${stay.city ? ` · ${stay.city}` : ""}`,
        })),
    },
    {
      name: "transportId",
      label: "Trayecto guardado",
      type: "select",
      empty: "Selecciona un tren, vuelo u otro trayecto",
      options: () =>
        store.collection("transports").map((transport) => ({
          value: transport.id,
          label: `${transport.type || "Trayecto"} · ${transport.origin} → ${transport.destination}`,
        })),
    },
    { name: "start", label: "Empieza", type: "time", required: true },
    { name: "end", label: "Termina", type: "time", required: true },
    { name: "city", label: "Ciudad", placeholder: "Tokio" },
    { name: "location", label: "Lugar o zona", placeholder: "Shibuya" },
    {
      name: "placeId",
      label: "Lugar guardado",
      type: "select",
      empty: "Sin vincular",
      options: () => store.collection("places").map((place) => ({ value: place.id, label: place.name })),
    },
    {
      name: "mapsUrl",
      label: "Enlace de Google Maps",
      type: "url",
      placeholder: "https://maps.app.goo.gl/…",
      help: "Opcional. Si lo dejas vacío, se buscará el lugar o zona indicado arriba.",
      full: true,
    },
    {
      name: "status",
      label: "Estado",
      type: "select",
      options: [{ value: "planned", label: "Planeado" }, { value: "done", label: "Realizado" }],
    },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  place: [
    { name: "name", label: "Nombre", required: true, full: true },
    { name: "city", label: "Ciudad", required: true },
    { name: "area", label: "Zona / barrio" },
    { name: "category", label: "Categoría", type: "select", options: CATEGORIES.place },
    {
      name: "markerIcon",
      label: "Icono del mapa",
      type: "emoji",
      options: EMOJI_GROUPS,
      full: true,
    },
    {
      name: "backgroundMode",
      label: "Fondo de la tarjeta",
      type: "select",
      options: [
        { value: PLACE_BACKGROUND_MODES.AUTO, label: "Imagen automática de Google" },
        { value: PLACE_BACKGROUND_MODES.IMAGE, label: "Imagen personalizada" },
        { value: PLACE_BACKGROUND_MODES.COLOR, label: "Color de fondo" },
        { value: PLACE_BACKGROUND_MODES.EMOJI, label: "Emoji / icono" },
      ],
      full: true,
    },
    {
      name: "backgroundImage",
      label: "Imagen personalizada",
      type: "image",
      help: "Tiene prioridad sobre la fotografía automática mientras este modo esté seleccionado.",
      full: true,
    },
    { name: "backgroundColor", label: "Color de fondo", type: "color", value: "#dce9df", full: true },
    {
      name: "backgroundEmoji",
      label: "Emoji de fondo",
      type: "emoji",
      options: EMOJI_GROUPS,
      full: true,
    },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Planeado", "Visitado", "Descartado"] },
    { name: "description", label: "Descripción", type: "textarea", full: true },
    { name: "address", label: "Dirección", full: true },
    { name: "lat", label: "Latitud", type: "number", step: "any" },
    { name: "lng", label: "Longitud", type: "number", step: "any" },
    { name: "hours", label: "Horario" },
    { name: "currency", label: "Moneda", type: "select", options: MONEY_OPTIONS },
    { name: "estimatedPrice", label: "Precio estimado", type: "number", min: 0, step: "0.01" },
    {
      name: "admission",
      label: "Entrada",
      type: "select",
      options: ["No necesita entrada", "Entrada gratuita", "Entrada de pago", "Reserva obligatoria"],
    },
    { name: "ticketPrice", label: "Precio de la entrada", type: "number", min: 0, step: "0.01" },
    { name: "duration", label: "Duración recomendada (min)", type: "number", min: 0 },
    { name: "priority", label: "Prioridad", type: "select", options: ["Imprescindible", "Alta", "Media", "Baja"] },
    { name: "assignedDate", label: "Día asignado", type: "date" },
    {
      name: "link",
      label: "Enlace de Google Maps",
      type: "url",
      placeholder: "https://maps.app.goo.gl/…",
      help: "Pega un enlace y pulsa Obtener datos para completar el lugar automáticamente.",
      full: true,
    },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  task: [
    { name: "title", label: "Tarea", required: true, full: true },
    { name: "assigneeId", label: "Responsable", type: "select", empty: "Sin asignar" },
    { name: "category", label: "Categoría", type: "select", options: CATEGORIES.task },
    { name: "priority", label: "Prioridad", type: "select", options: ["Alta", "Media", "Baja"] },
    { name: "dueDate", label: "Fecha límite", type: "date" },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Completada"] },
    {
      name: "notes",
      label: "Información",
      type: "textarea",
      placeholder: "Detalles, enlaces, instrucciones o cualquier información útil…",
      full: true,
    },
  ],
  purchase: [
    { name: "product", label: "Producto", required: true, full: true },
    {
      name: "photo",
      label: "Foto del producto",
      type: "image",
      help: "La imagen se optimiza antes de guardarse y se incluye al exportar el viaje.",
      full: true,
    },
    { name: "category", label: "Categoría", type: "select", options: CATEGORIES.shopping },
    { name: "recipient", label: "Para quién" },
    { name: "city", label: "Ciudad" },
    { name: "store", label: "Tienda recomendada" },
    { name: "currency", label: "Moneda", type: "select", options: MONEY_OPTIONS },
    { name: "estimatedPrice", label: "Precio estimado", type: "number", min: 0, step: "0.01" },
    { name: "maxBudget", label: "Presupuesto máximo", type: "number", min: 0, step: "0.01" },
    { name: "priority", label: "Prioridad", type: "select", options: ["Alta", "Media", "Baja"] },
    {
      name: "status",
      label: "Estado",
      type: "select",
      options: ["Pendiente", "Encontrado", "Comprado", "No encontrado"],
    },
    {
      name: "actualPrice",
      label: "Precio pagado",
      type: "number",
      min: 0,
      help: "Al indicar un importe, la compra se marcará automáticamente como comprada.",
    },
    { name: "purchaseDate", label: "Fecha de compra", type: "date" },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  expense: [
    { name: "title", label: "Concepto", required: true, full: true },
    { name: "category", label: "Categoría", type: "select", options: CATEGORIES.expense },
    { name: "city", label: "Ciudad" },
    { name: "date", label: "Fecha", type: "date" },
    { name: "currency", label: "Moneda", type: "select", options: MONEY_OPTIONS },
    { name: "estimatedAmount", label: "Importe previsto", type: "number", min: 0, step: "0.01" },
    { name: "actualAmount", label: "Importe pagado", type: "number", min: 0, step: "0.01" },
    { name: "paymentStatus", label: "Pago", type: "select", options: ["Pendiente", "Parcial", "Pagado"] },
    { name: "paidByUserId", label: "Pagado por", type: "select", empty: "Fondo común / sin asignar" },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  fund: [
    { name: "title", label: "Concepto", required: true, placeholder: "Ej. Fondo inicial", full: true },
    { name: "contributor", label: "Aportado por", type: "select", required: true },
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "currency", label: "Moneda", type: "select", options: MONEY_OPTIONS },
    { name: "amount", label: "Importe", type: "number", min: 0.01, step: "0.01", required: true },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  stay: [
    { name: "name", label: "Alojamiento", required: true, full: true },
    {
      name: "platform",
      label: "Plataforma de reserva",
      type: "select",
      options: ["En persona", "Airbnb", "Booking", "Otros"],
    },
    {
      name: "bookingStatus",
      label: "Estado de la reserva",
      type: "select",
      options: ["Pendiente", "Confirmada", "Cancelada"],
    },
    { name: "city", label: "Ciudad", required: true },
    { name: "address", label: "Dirección" },
    { name: "checkInDate", label: "Entrada", type: "date", required: true },
    { name: "checkInTime", label: "Hora de entrada", type: "time" },
    { name: "checkOutDate", label: "Salida", type: "date", required: true },
    { name: "checkOutTime", label: "Hora de salida", type: "time" },
    { name: "currency", label: "Moneda", type: "select", options: MONEY_OPTIONS },
    { name: "price", label: "Precio total", type: "number", min: 0, step: "0.01" },
    {
      name: "paidAmount",
      label: "Importe pagado",
      type: "number",
      min: 0,
      help: "Permite reflejar pagos parciales. El estado se actualizará automáticamente.",
    },
    { name: "paymentStatus", label: "Pago", type: "select", options: ["Pendiente", "Parcial", "Pagado"] },
    { name: "reference", label: "Número de reserva" },
    { name: "cancellationDeadline", label: "Cancelación gratuita hasta", type: "date" },
    { name: "contact", label: "Contacto" },
    {
      name: "luggageStorage",
      label: "¿Permiten dejar maletas?",
      type: "select",
      options: ["Por confirmar", "No", "Antes del check-in", "Después del check-out", "Antes y después"],
    },
    { name: "luggageNotes", label: "Detalles sobre las maletas" },
    { name: "lat", label: "Latitud", type: "number", step: "any" },
    { name: "lng", label: "Longitud", type: "number", step: "any" },
    {
      name: "link",
      label: "Enlace de la reserva / alojamiento",
      type: "url",
      placeholder: "https://…",
      full: true,
    },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  transport: [
    { name: "type", label: "Tipo", type: "select", options: CATEGORIES.transport },
    { name: "operator", label: "Operador" },
    { name: "origin", label: "Origen", required: true },
    { name: "destination", label: "Destino", required: true },
    { name: "departureDate", label: "Fecha de salida", type: "date", required: true },
    { name: "departureTime", label: "Hora de salida", type: "time", required: true },
    { name: "arrivalDate", label: "Fecha de llegada", type: "date" },
    { name: "arrivalTime", label: "Hora de llegada", type: "time" },
    { name: "duration", label: "Duración (min)", type: "number", min: 0 },
    { name: "currency", label: "Moneda", type: "select", options: MONEY_OPTIONS },
    { name: "price", label: "Precio", type: "number", min: 0, step: "0.01" },
    {
      name: "paidAmount",
      label: "Importe pagado",
      type: "number",
      min: 0,
      step: "0.01",
      help: "Permite distinguir el gasto real del importe aún comprometido.",
    },
    { name: "paymentStatus", label: "Pago", type: "select", options: ["Pendiente", "Parcial", "Pagado"] },
    { name: "reservation", label: "Reserva" },
    { name: "seat", label: "Asiento" },
    {
      name: "status",
      label: "Estado",
      type: "select",
      options: ["Por reservar", "Confirmado", "Realizado", "Cancelado"],
    },
    { name: "link", label: "Enlace", type: "url", full: true },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  reservation: [
    { name: "title", label: "Reserva", required: true, full: true },
    {
      name: "type",
      label: "Tipo",
      type: "select",
      options: ["Hotel", "Restaurante", "Museo", "Actividad", "Transporte", "Entrada", "Otro"],
    },
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "time", label: "Hora", type: "time" },
    { name: "reference", label: "Referencia" },
    { name: "currency", label: "Moneda", type: "select", options: MONEY_OPTIONS },
    { name: "price", label: "Precio total", type: "number", min: 0, step: "0.01" },
    { name: "paidAmount", label: "Importe pagado", type: "number", min: 0, step: "0.01" },
    { name: "paymentStatus", label: "Pago", type: "select", options: ["Pendiente", "Parcial", "Pagado"] },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Confirmada", "Realizada", "Cancelada"] },
    { name: "link", label: "Documento / enlace", type: "url", full: true },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  inspiration: [
    {
      name: "url",
      label: "Enlace del vídeo",
      type: "url",
      required: true,
      placeholder: "https://www.tiktok.com/…",
      help: "Admite TikTok, Instagram Reels, YouTube Shorts y vídeos de YouTube.",
      full: true,
    },
    {
      name: "category",
      label: "Categoría",
      type: "select",
      options: ["Lugares", "Comida", "Actividades", "Compras", "Alojamiento", "Transporte", "Consejos", "Otros"],
    },
    {
      name: "note",
      label: "Nota",
      type: "textarea",
      placeholder: "¿Qué quieres recordar de este vídeo?",
      full: true,
    },
  ],
  note: [
    { name: "title", label: "Título", required: true, placeholder: "Ej. Cosas que recordar", full: true },
    {
      name: "content",
      label: "Texto",
      type: "textarea",
      placeholder: "Escribe aquí tu nota…",
      full: true,
    },
  ],
};

function resolvedFields(type, values = {}) {
  return fields[type].map((field) => ({
    ...field,
    options: type === "fund" && field.name === "contributor"
      ? fundContributorOptions(store.getState().members, values.contributor)
      : ["task:assigneeId", "expense:paidByUserId"].includes(`${type}:${field.name}`)
      ? memberOptions(values[field.name])
      : typeof field.options === "function"
      ? field.options()
      : field.options,
  }));
}

function memberOptions(currentId = "") {
  const options = store.collection("members").map(({ user }) => ({
    value: user.id,
    label: user.username ? `${user.name} (@${user.username})` : user.name,
  }));
  if (currentId && !options.some(({ value }) => value === currentId)) {
    options.push({ value: currentId, label: "Miembro anterior" });
  }
  return options;
}

function memberName(userId, fallback = "Sin asignar") {
  return store.collection("members").find(({ user }) => user.id === userId)?.user.name || fallback;
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function activeDate() {
  const trip = store.activeTrip;
  const today = todayIso();
  if (!ui.selectedDate) ui.selectedDate = today >= trip.startDate && today <= trip.endDate ? today : trip.startDate;
  return ui.selectedDate;
}
function tripDay(date) {
  return Math.max(1, dateRange(store.activeTrip.startDate, date).length);
}
function daysUntil(date) {
  return Math.ceil((new Date(`${date}T12:00:00`) - new Date()) / 86400000);
}
function moneyConfig() {
  return tripCurrencyConfig(store.activeTrip, store.getState().exchangeRates);
}
function itemCurrency(item) {
  return item?.currency || store.activeTrip.budgetCurrency || store.activeTrip.currency;
}
function toPrimary(amount, currency = store.activeTrip.currency) {
  const config = moneyConfig();
  const converted = convertCurrency(amount, currency, config.primary, config.rates);
  return converted ?? (currency === config.primary ? Number(amount || 0) : 0);
}
function itemToPrimary(amount, item) {
  const converted = convertCurrency(amount, itemCurrency(item), store.activeTrip.currency, moneyConfig().rates);
  if (converted !== null) return converted;
  const snapshot = Number(item?.exchangeRateSnapshot || 0);
  if (
    snapshot > 0 && item.exchangeRateBase === itemCurrency(item) && item.exchangeRateQuote === store.activeTrip.currency
  ) {
    return Number(amount || 0) * snapshot;
  }
  return itemCurrency(item) === store.activeTrip.currency ? Number(amount || 0) : 0;
}
function money(amount, currency = store.activeTrip.currency, options) {
  return moneyPair(amount, currency, moneyConfig(), options);
}
function itemMoney(amount, item, options) {
  const config = moneyConfig();
  const snapshot = Number(item?.exchangeRateSnapshot || 0);
  if (snapshot > 0 && item.exchangeRateBase && item.exchangeRateQuote) {
    config.rates[rateKey(item.exchangeRateBase, item.exchangeRateQuote)] ??= snapshot;
    config.rates[rateKey(item.exchangeRateQuote, item.exchangeRateBase)] ??= 1 / snapshot;
  }
  return moneyPair(amount, itemCurrency(item), config, options);
}
function primaryMoney(amount, currency = store.activeTrip.currency) {
  return formatMoney(toPrimary(amount, currency), store.activeTrip.currency);
}
function normalizedExpenses() {
  return store.collection("expenses").map((item) => ({
    ...item,
    actualAmount: itemToPrimary(item.actualAmount, item),
    estimatedAmount: itemToPrimary(item.estimatedAmount, item),
  }));
}
function normalizedFunds() {
  return store.collection("funds").map((item) => ({
    ...item,
    amount: itemToPrimary(item.amount, item),
  }));
}

function normalizedPurchases() {
  return store.collection("purchases").map((item) => ({
    ...item,
    estimatedPrice: itemToPrimary(item.estimatedPrice, item),
    actualPrice: itemToPrimary(item.actualPrice, item),
    maxBudget: itemToPrimary(item.maxBudget, item),
  }));
}

function normalizedStays() {
  return store.collection("stays").map((item) => ({
    ...item,
    price: itemToPrimary(item.price, item),
    paidAmount: itemToPrimary(item.paidAmount, item),
  }));
}

function normalizedTransports() {
  return store.collection("transports").map((item) => ({
    ...item,
    price: itemToPrimary(item.price, item),
    paidAmount: itemToPrimary(item.paidAmount, item),
  }));
}

function normalizedBudgetTrip() {
  return {
    ...store.activeTrip,
    budget: toPrimary(store.activeTrip.budget, store.activeTrip.budgetCurrency || store.activeTrip.currency),
  };
}

function budgetChartItems(
  expenses,
  purchases = normalizedPurchases(),
  stays = normalizedStays(),
  transports = normalizedTransports(),
) {
  return [
    ...expenses,
    ...purchases.map((item) => ({ category: "Compras", actualAmount: Number(item.actualPrice || 0) })),
    ...stays.map((item) => ({ category: "Alojamiento", actualAmount: stayBudgetAmounts(item).paid })),
    ...transports.map((item) => ({ category: "Transporte", actualAmount: transportBudgetAmounts(item).paid })),
  ].filter((item) => Number(item.actualAmount || 0) > 0);
}

function applyTheme() {
  const setting = store.getState().settings.theme;
  const theme = setting === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : setting;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#151615" : "#f7f6f2");
}

function navButton(route, label, iconName, mobile = false) {
  const active = ui.route === route ||
    (mobile && route === "more" && !["dashboard", "itinerary", "map", "budget"].includes(ui.route));
  return `<button class="nav-link ${active ? "active" : ""}" data-route="${route}">${
    icon(iconName)
  }<span>${label}</span></button>`;
}

function versionReference(className = "") {
  const commit = ui.commitSha || "desconocida";
  const shortCommit = ui.commitSha ? ui.commitSha.slice(0, 8) : commit;
  return `<small class="app-version ${className}" title="Commit de la aplicación: ${esc(commit)}">versión <code>${
    esc(shortCommit)
  }</code></small>`;
}

function layout(content) {
  const trip = store.activeTrip;
  const members = store.collection("members");
  return `<div class="app-shell">
    <aside class="sidebar"><a class="brand" href="#dashboard"><span class="brand-mark">旅</span><span>Tabi<small>Travel planner</small></span></a><nav class="nav">${
    NAV.map(([r, l, i]) => navButton(r, l, i)).join("")
  }</nav><div class="sidebar-foot"><div class="trip-mini"><span class="emoji">${trip.emoji}</span><span><strong>${
    esc(trip.name)
  }</strong><small>${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}</small></span></div>${
    versionReference("app-version-sidebar")
  }</div></aside>
    <main class="main"><header class="topbar"><div class="page-heading"><h1>${ROUTES[ui.route] || "Tabi"}</h1><p>${
    DESCRIPTIONS[ui.route] || ""
  }</p></div><div class="top-actions"><button class="avatar-stack desktop-only" data-route="settings" aria-label="Miembros del viaje">${
    members.slice(0, 3).map((member) => avatar(member.user)).join("")
  }${members.length > 3 ? `<span class="avatar more">+${members.length - 3}</span>` : ""}</button>${
    session.can(PERMISSIONS.MEMBER_INVITE)
      ? `<button class="btn btn-secondary" data-new-invite>${icon("users")} Compartir</button>`
      : ""
  }<button class="btn btn-secondary desktop-only" data-trip-list>Mis viajes</button><button class="btn btn-secondary icon-btn" data-theme-toggle aria-label="Cambiar tema">${
    icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")
  }</button></div></header><div class="content ${ui.route === "map" ? "content-map" : ""}">${content}</div>${
    versionReference("app-version-project-mobile")
  }</main>
    <nav class="mobile-nav">${navButton("dashboard", "Inicio", "dashboard", true)}${
    navButton("itinerary", "Plan", "calendar", true)
  }${navButton("map", "Mapa", "map", true)}${navButton("budget", "Gastos", "wallet", true)}${
    navButton("more", "Más", "menu", true)
  }</nav>
  </div>`;
}

function render() {
  if (!session.currentTrip) return renderTripsDashboard();
  applyTheme();
  const renderers = {
    dashboard: renderDashboard,
    itinerary: renderItinerary,
    map: renderMap,
    places: renderPlaces,
    purchases: renderPurchases,
    tasks: renderTasks,
    notes: renderNotes,
    budget: renderBudget,
    stays: renderStays,
    transport: renderTransport,
    reservations: renderReservations,
    inspiration: renderInspiration,
    settings: renderSettings,
    more: renderMore,
  };
  app.innerHTML = layout((renderers[ui.route] || renderDashboard)());
  bindCommon();
  bindRoute();
}

function renderLoading(message = "Preparando tu viaje…") {
  app.innerHTML =
    `<main class="auth-shell"><section class="auth-card card"><div class="brand"><span class="brand-mark">旅</span><span>Tabi</span></div><div class="loading-orbit"></div><h2>${
      esc(message)
    }</h2></section></main>`;
}

function renderAuth(error = "") {
  applyTheme();
  const register = ui.authMode === "register";
  app.innerHTML =
    `<main class="auth-shell"><section class="auth-card card"><div class="brand"><span class="brand-mark">旅</span><span>Tabi<small>Viajes que se comparten</small></span></div><div><span class="hero-eyebrow" style="color:var(--primary)">${
      register ? "Crea tu espacio" : "Bienvenido de nuevo"
    }</span><h1>${register ? "Empieza a planear en compañía" : "Continúa tu próxima aventura"}</h1><p>${
      register
        ? "Crea una cuenta para organizar y compartir tus viajes."
        : "Inicia sesión para acceder a tus viajes compartidos."
    }</p></div>${
      error ? `<div class="insight warning">${icon("alert")}<div>${esc(error)}</div></div>` : ""
    }<form id="auth-form" class="form-grid">${
      register
        ? `<div class="field full"><label>Nombre</label><input name="name" required minlength="2" maxlength="80" autocomplete="name" placeholder="Tu nombre"></div><div class="field full"><label>Usuario</label><input name="username" required minlength="3" maxlength="30" pattern="[A-Za-zÀ-ÿ0-9._-]+" autocomplete="username" placeholder="hortensi"><span class="field-help">Letras, números, punto, guion o guion bajo.</span></div><div class="field full"><label>Email</label><input name="email" type="email" required maxlength="254" autocomplete="email" placeholder="tu@email.com"></div>`
        : ""
    }${
      register
        ? ""
        : `<div class="field full"><label>Usuario o email</label><input name="identifier" required maxlength="254" autocomplete="username" placeholder="hortensi o tu@email.com"></div>`
    }<div class="field full"><label>Contraseña</label><input name="password" type="password" required minlength="6" maxlength="200" autocomplete="${
      register ? "new-password" : "current-password"
    }"><span class="field-help">Mínimo 6 caracteres.</span></div><div class="field full"><button class="btn btn-primary" type="submit" ${
      ui.busy ? "disabled" : ""
    }>${
      ui.busy ? "Un momento…" : register ? "Crear cuenta" : "Iniciar sesión"
    }</button></div></form><button class="btn btn-ghost" data-auth-mode="${register ? "login" : "register"}">${
      register ? "Ya tengo cuenta" : "Crear una cuenta"
    }</button></section><aside class="auth-art"><div><h2>Planear juntos hace que el viaje empiece antes.</h2><p>Itinerario, presupuesto y reservas sincronizados para todo el equipo.</p></div></aside>${
      versionReference("app-version-auth")
    }</main>`;
  bindAuth();
}

function bindAuth() {
  app.querySelector("[data-auth-mode]")?.addEventListener("click", () => {
    ui.authMode = app.querySelector("[data-auth-mode]").dataset.authMode;
    renderAuth();
  });
  app.querySelector("#auth-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    ui.busy = true;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    renderAuth();
    try {
      ui.authMode === "register" ? await session.register(values) : await session.login(values);
      ui.busy = false;
      if (inviteTokenFromPath()) await renderInvitation();
      else if (shareTargetFromPath()) await renderShareTarget();
      else renderTripsDashboard();
    } catch (error) {
      ui.busy = false;
      renderAuth(error.message);
    }
  });
}

function renderTripsDashboard() {
  if (!session.currentUser) return renderAuth();
  applyTheme();
  const today = todayIso();
  const upcoming = session.trips.filter((trip) => trip.endDate >= today);
  const past = session.trips.filter((trip) => trip.endDate < today);
  app.innerHTML =
    `<main class="trips-shell"><header class="trips-header"><a class="brand" href="/"><span class="brand-mark">旅</span><span>Tabi<small>Travel planner</small></span></a><div class="top-actions">${
      avatar(session.currentUser)
    }<span class="desktop-only"><strong>${
      esc(session.currentUser.name)
    }</strong></span><button class="btn btn-secondary" data-logout>Cerrar sesión</button></div></header><div class="trips-content"><section class="trips-welcome"><div><span class="hero-eyebrow" style="color:var(--primary)">Tu espacio</span><h1>Mis viajes</h1><p>Propios y compartidos, todos en un solo lugar.</p></div><button class="btn btn-primary" data-create-trip>${
      icon("plus")
    } Crear viaje</button></section>${
      store.hasLegacyData() && !session.trips.length
        ? `<div class="insight warning">${
          icon("upload")
        }<div><strong>Encontramos tu viaje local anterior</strong>Crea un viaje y podrás importar todos sus datos sin perderlos.</div></div>`
        : ""
    }<section><div class="section-title"><div><h2>Próximos viajes</h2><p>${upcoming.length} aventuras por delante</p></div></div><div class="grid grid-3">${
      upcoming.map(tripCard).join("") ||
      emptyState(
        "Tu próximo viaje empieza aquí",
        "Crea un viaje o abre un enlace de invitación.",
        `<button class="btn btn-primary" data-create-trip>${icon("plus")} Crear viaje</button>`,
      )
    }</div></section>${
      past.length
        ? `<section><div class="section-title"><div><h2>Viajes pasados</h2><p>Recuerdos y planes que puedes duplicar</p></div></div><div class="grid grid-3">${
          past.map(tripCard).join("")
        }</div></section>`
        : ""
    }</div>${versionReference("app-version-page")}</main>`;
  bindTripDashboard();
}

function tripCard(trip) {
  return `<article class="card trip-card"><button class="trip-card-main" data-enter-trip="${trip.id}"><span class="trip-emoji">${trip.emoji}</span><div><h3>${
    esc(trip.name)
  }</h3><p>${formatDate(trip.startDate, { year: "numeric" })} — ${
    formatDate(trip.endDate, { year: "numeric" })
  }</p><div>${
    badge(ROLE_LABELS[trip.role], trip.role === "owner" ? "red" : "blue")
  } <span class="cell-sub" style="display:inline">${trip.memberCount} miembros</span></div></div>${
    icon("chevron")
  }</button><footer><span>${trip.role === "owner" ? "Viaje propio" : "Compartido contigo"}</span><div>${
    trip.role !== "viewer"
      ? `<button class="btn btn-ghost icon-btn" data-duplicate-trip="${trip.id}" title="Duplicar">${
        icon("file")
      }</button>`
      : ""
  }${
    trip.role !== "owner"
      ? `<button class="btn btn-ghost icon-btn" data-leave-trip="${trip.id}" title="Abandonar">${
        icon("close")
      }</button>`
      : ""
  }${
    trip.role === "owner"
      ? `<button class="btn btn-ghost icon-btn" data-delete-dashboard-trip="${trip.id}" title="Eliminar viaje" aria-label="Eliminar ${
        esc(trip.name)
      }">${icon("trash")}</button>`
      : ""
  }</div></footer></article>`;
}

function bindTripDashboard() {
  app.querySelectorAll("[data-enter-trip]").forEach((button) =>
    button.addEventListener("click", () => enterTrip(button.dataset.enterTrip))
  );
  app.querySelectorAll("[data-create-trip]").forEach((button) => button.addEventListener("click", createTrip));
  app.querySelectorAll("[data-duplicate-trip]").forEach((button) =>
    button.addEventListener("click", async () => {
      try {
        const result = await apiClient.post(`/trips/${button.dataset.duplicateTrip}/duplicate`);
        await session.loadTrips();
        toast("Viaje duplicado");
        await enterTrip(result.tripId);
      } catch (error) {
        toast(error.message, "error");
      }
    })
  );
  app.querySelectorAll("[data-leave-trip]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (!confirm("¿Abandonar este viaje compartido?")) return;
      try {
        await apiClient.post(`/trips/${button.dataset.leaveTrip}/leave`);
        await session.loadTrips();
        renderTripsDashboard();
      } catch (error) {
        toast(error.message, "error");
      }
    })
  );
  app.querySelectorAll("[data-delete-dashboard-trip]").forEach((button) =>
    button.addEventListener("click", async () => {
      const trip = session.trips.find((item) => item.id === button.dataset.deleteDashboardTrip);
      if (!confirm(`¿Eliminar “${trip?.name || "este viaje"}” definitivamente? Esta acción no se puede deshacer.`)) {
        return;
      }
      try {
        await apiClient.delete(`/trips/${button.dataset.deleteDashboardTrip}`);
        await session.loadTrips();
        toast("Viaje eliminado");
        renderTripsDashboard();
      } catch (error) {
        toast(error.message, "error");
      }
    })
  );
  app.querySelector("[data-logout]")?.addEventListener("click", performLogout);
}

function createTrip() {
  modal({
    title: "Nuevo viaje",
    fields: [
      { name: "name", label: "Nombre", required: true, full: true },
      { name: "emoji", label: "Emoji", type: "select", value: "✈️", options: TRIP_EMOJIS },
      {
        name: "country",
        label: "País",
        type: "autocomplete",
        required: true,
        placeholder: "Escribe para buscar un país",
        options: countryOptions(),
      },
      { name: "startDate", label: "Inicio", type: "date", required: true },
      { name: "endDate", label: "Fin", type: "date", required: true },
      { name: "travelers", label: "Viajeros", type: "number", min: 1, value: 1 },
      { name: "budget", label: "Presupuesto", type: "number", min: 0 },
      { name: "currency", label: "Moneda principal", type: "select", options: MONEY_OPTIONS },
      { name: "secondaryCurrency", label: "Moneda secundaria", type: "select", options: MONEY_OPTIONS, value: "EUR" },
      {
        name: "exchangeRateMode",
        label: "Tipo de cambio",
        type: "select",
        options: [{ value: "automatic", label: "Automático (Internet)" }, { value: "manual", label: "Manual" }],
        value: "automatic",
      },
    ],
    onSubmit: async (values) => {
      try {
        const { trip } = await apiClient.post("/trips", values);
        await session.loadTrips();
        await enterTrip(trip.id);
        if (store.hasLegacyData() && confirm("¿Quieres importar ahora los datos de la versión local anterior?")) {
          await importLegacy();
        }
      } catch (error) {
        toast(error.message, "error");
      }
    },
    onReady: initializeCurrencyPairFields,
  });
}

function initializeCurrencyPairFields(root) {
  const primary = root.querySelector("#field-currency");
  const secondary = root.querySelector("#field-secondaryCurrency");
  if (!primary || !secondary) return;
  const keepDistinct = (changed) => {
    if (primary.value !== secondary.value) return;
    if (changed === primary) secondary.value = alternateCurrency(primary.value);
    else primary.value = alternateCurrency(secondary.value);
  };
  primary.addEventListener("change", () => keepDistinct(primary));
  secondary.addEventListener("change", () => keepDistinct(secondary));
  keepDistinct(primary);
}

async function enterTrip(tripId, route = "dashboard") {
  renderLoading("Cargando el viaje…");
  try {
    const payload = await store.loadTrip(tripId, handleRemoteChange);
    session.selectTrip(payload);
    ui.selectedDate = "";
    ui.route = route;
    location.hash = route;
    render();
  } catch (error) {
    toast(error.message, "error");
    session.clearTrip();
    await session.loadTrips().catch(() => {});
    renderTripsDashboard();
  }
}

async function handleRemoteChange(change) {
  if (change.user?.id === session.currentUser?.id) return;
  try {
    const payload = await store.loadTrip(store.activeTrip.id, handleRemoteChange);
    session.selectTrip(payload);
    toast(`${change.user?.name || "Alguien"} ha actualizado el viaje`);
    render();
  } catch {
    toast("No se pudieron sincronizar los últimos cambios.", "error");
  }
}

async function performLogout() {
  store.closeEvents();
  await session.logout();
  history.replaceState({}, "", "/");
  renderAuth();
}

function inviteTokenFromPath() {
  const match = location.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)$/);
  return match?.[1] || "";
}

function shareTargetFromPath() {
  return location.pathname === "/share";
}

function incomingInspiration() {
  const params = new URLSearchParams(location.search);
  return sharedInspirationLink(params.get("url"), params.get("text"), params.get("title"));
}

function renderShareTarget() {
  applyTheme();
  if (!session.currentUser) return renderAuth();
  const link = incomingInspiration();
  const trips = session.trips.filter((trip) => trip.role !== "viewer");
  const finish = () => {
    history.replaceState({}, "", "/");
    renderTripsDashboard();
  };
  app.innerHTML =
    `<main class="auth-shell share-shell"><section class="auth-card card"><div class="brand"><span class="brand-mark">旅</span><span>Tabi<small>Inspiración</small></span></div>${
      link
        ? `<div><span class="hero-eyebrow" style="color:var(--primary)">Enlace recibido</span><h1>Guardar en un viaje</h1><p>Elige dónde quieres guardar este vídeo de ${
          esc(link.platform)
        }.</p></div><div class="shared-link-preview"><span class="inspiration-source ${link.key}">${
          icon("play")
        }</span><div><strong>${esc(link.platform)}</strong><small>${
          esc(new URL(link.url).hostname.replace(/^www\./, ""))
        }</small></div></div>${
          trips.length
            ? `<form id="share-target-form" class="form-grid"><div class="field full"><label for="share-trip">Viaje</label><select id="share-trip" name="tripId" required>${
              trips.map((trip) => `<option value="${esc(trip.id)}">${esc(`${trip.emoji} ${trip.name}`)}</option>`).join(
                "",
              )
            }</select></div><div class="field full"><label for="share-category">Categoría</label><select id="share-category" name="category">${
              ["Lugares", "Comida", "Actividades", "Compras", "Alojamiento", "Transporte", "Consejos", "Otros"]
                .map((category) =>
                  `<option value="${esc(category)}">${esc(visualLabel(category))}</option>`
                ).join("")
            }</select></div><div class="field full"><label for="share-note">Nota</label><textarea id="share-note" name="note" placeholder="¿Qué quieres recordar de este vídeo?"></textarea></div><div class="field full"><button class="btn btn-primary" type="submit">${
              icon("plus")
            } Guardar en Inspiración</button></div></form>`
            : `<div class="insight warning">${
              icon("alert")
            }<div><strong>No tienes viajes editables</strong>Crea un viaje o pide permiso de edición para guardar el enlace.</div></div>`
        }`
        : `<div><span class="hero-eyebrow" style="color:var(--primary)">Enlace no compatible</span><h1>No se puede guardar este contenido</h1><p>Comparte un vídeo de TikTok, Instagram Reels, YouTube Shorts o YouTube.</p></div>`
    }<button class="btn btn-secondary" type="button" data-cancel-share>Cancelar</button></section><aside class="auth-art"><div><h2>Una idea compartida puede convertirse en el mejor plan del viaje.</h2></div></aside></main>`;
  app.querySelector("[data-cancel-share]")?.addEventListener("click", finish);
  app.querySelector("#share-target-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    const { tripId, category, note } = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await apiClient.post(`/trips/${tripId}/inspirations`, { url: link.url, category, note });
      history.replaceState({}, "", "/");
      await enterTrip(tripId, "inspiration");
      toast("Enlace guardado en Inspiración");
    } catch (error) {
      button.disabled = false;
      toast(error.message || "No se ha podido guardar el enlace.", "error");
    }
  });
}

async function renderInvitation() {
  applyTheme();
  const token = inviteTokenFromPath();
  if (!token) return;
  renderLoading("Comprobando la invitación…");
  try {
    const { invitation } = await apiClient.get(`/invite/${token}`);
    app.innerHTML =
      `<main class="auth-shell invite-shell"><section class="auth-card card"><div class="brand"><span class="brand-mark">旅</span><span>Tabi</span></div><span class="trip-emoji">${invitation.tripEmoji}</span><div><span class="hero-eyebrow" style="color:var(--primary)">Invitación al viaje</span><h1>${
        esc(invitation.tripName)
      }</h1><p><strong>${esc(invitation.creatorName)}</strong> te ha invitado a colaborar como ${
        visualLabel(ROLE_LABELS[invitation.role])
      }.</p></div><div class="invitation-role">${
        badge(ROLE_LABELS[invitation.role], invitation.role === "editor" ? "red" : "blue")
      }<span>${
        invitation.role === "editor"
          ? "Podrás editar el contenido del viaje."
          : "Podrás consultar el viaje sin modificarlo."
      }</span></div>${
        session.currentUser
          ? `<button class="btn btn-primary" data-accept-invite>${
            icon("check")
          } Unirme al viaje</button><p class="cell-sub">Conectado como ${esc(session.currentUser.email)}</p>`
          : `<div class="grid grid-2"><button class="btn btn-primary" data-invite-register>Crear cuenta</button><button class="btn btn-secondary" data-invite-login>Iniciar sesión</button></div><p class="cell-sub">La invitación seguirá disponible después de identificarte.</p>`
      }</section><aside class="auth-art"><div><span>${invitation.tripEmoji}</span><h2>Los mejores planes se construyen juntos.</h2></div></aside></main>`;
    app.querySelector("[data-invite-register]")?.addEventListener("click", () => {
      ui.authMode = "register";
      renderAuth();
    });
    app.querySelector("[data-invite-login]")?.addEventListener("click", () => {
      ui.authMode = "login";
      renderAuth();
    });
    app.querySelector("[data-accept-invite]")?.addEventListener("click", async () => {
      try {
        const result = await apiClient.post(`/invite/${token}/accept`);
        history.replaceState({}, "", "/");
        await session.loadTrips();
        await enterTrip(result.tripId);
      } catch (error) {
        toast(error.message, "error");
      }
    });
  } catch (error) {
    app.innerHTML = `<main class="auth-shell"><section class="auth-card card">${
      emptyState("Invitación no disponible", error.message, `<a class="btn btn-primary" href="/">Ir a Tabi</a>`)
    }</section></main>`;
  }
}

function renderDashboard() {
  const trip = store.activeTrip;
  const allDates = dateRange(trip.startDate, trip.endDate);
  const today = todayIso();
  const date = today >= trip.startDate && today <= trip.endDate
    ? today
    : allDates.find((item) => item >= today) || trip.startDate;
  const activities = activitiesForDate(date).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = activities[0];
  const expenses = normalizedExpenses();
  const purchases = normalizedPurchases();
  const stays = normalizedStays();
  const transports = normalizedTransports();
  const summary = budgetSummary(normalizedBudgetTrip(), expenses, purchases, normalizedFunds(), stays, transports);
  const pendingTasks = store.collection("tasks").filter((task) => task.status !== "Completada");
  const pendingPurchases = store.collection("purchases").filter((item) =>
    item.status === "Pendiente" || item.status === "Encontrado"
  );
  const pendingPurchaseTotal = pendingPurchases.reduce(
    (sum, item) => sum + itemToPrimary(item.estimatedPrice, item),
    0,
  );
  const nextTransport =
    [...store.collection("transports")].filter((item) => item.departureDate >= today).sort((a, b) =>
      `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)
    )[0];
  const countdown = daysUntil(trip.startDate);
  const categoryTotals = groupTotals(budgetChartItems(expenses, purchases, stays, transports), "category");
  const max = Math.max(...categoryTotals.map(([, value]) => value), 1);
  return `<div class="section-stack">
    <section class="hero card"><div><div class="hero-eyebrow">${
    countdown > 0
      ? "Próxima aventura"
      : countdown >= -allDates.length
      ? `Día ${tripDay(today)} de ${allDates.length}`
      : "Tu aventura"
  }</div><h2>${esc(trip.name)} ${trip.emoji}</h2><p>${formatDate(trip.startDate, { year: "numeric" })} — ${
    formatDate(trip.endDate, { year: "numeric" })
  } · ${trip.travelers} viajeros</p></div><div class="hero-footer"><div class="countdown">${
    countdown > 0 ? `${countdown} días` : countdown === 0 ? "¡Hoy empieza!" : `${allDates.length} días`
  }<small>${
    countdown > 0 ? "para despegar" : "de viaje"
  }</small></div><button class="btn" data-go-date="${date}">Ver itinerario ${icon("arrow")}</button></div></section>
    <div class="grid grid-4 stats-mobile">
      ${
    statCard(
      "wallet",
      "Presupuesto restante",
      money(summary.remaining),
      `${Math.round(summary.spent / Math.max(summary.budget, 1) * 100)}% utilizado`,
      "",
      true,
    )
  }
      ${statCard("clock", "Próximo evento", upcoming?.start || "—", upcoming?.title || "Sin planes", "red")}
      ${
    statCard(
      "train",
      "Próximo transporte",
      nextTransport?.departureTime || "—",
      nextTransport ? `${nextTransport.origin} → ${nextTransport.destination}` : "Sin trayectos",
      "amber",
    )
  }
      ${
    statCard(
      "check",
      "Tareas pendientes",
      pendingTasks.length,
      `${pendingTasks.filter((task) => task.priority === "Alta").length} de prioridad alta`,
      "",
    )
  }
    </div>
    <div class="grid dashboard-grid"><div class="section-stack">
      <section class="card card-pad"><div class="card-head"><div><h2>${
    date === today ? "Itinerario de hoy" : `Día ${tripDay(date)} · ${formatDate(date)}`
  }</h2><p>${activities.length} eventos planificados</p></div><button class="btn btn-ghost" data-go-date="${date}">Ver día ${
    icon("chevron")
  }</button></div>${miniTimeline(activities)}</section>
      <section class="card card-pad"><div class="card-head"><div><h2>Gastos por categoría</h2><p>Importes reales en ${
    esc(currencyDefinition(trip.currency).name.toLocaleLowerCase("es"))
  }</p></div>${money(summary.spent)}</div><div class="chart-bars">${
    categoryTotals.map(([label, value]) =>
      `<div class="chart-column"><div class="chart-bar" style="height:${Math.max(3, value / max * 100)}%" data-value="${
        primaryMoney(value)
      }"></div><span class="chart-label">${esc(label)}</span></div>`
    ).join("")
  }</div></section>
    </div><aside class="section-stack">
      <section class="card card-pad"><div class="card-head"><div><h3>Progreso del viaje</h3><p>${
    store.collection("places").filter((p) => p.status === "Planeado").length
  } lugares ya planificados</p></div></div><div class="progress red"><span style="width:${
    Math.min(
      100,
      store.collection("places").filter((p) => p.assignedDate).length / Math.max(1, store.collection("places").length) *
        100,
    )
  }%"></span></div><div class="legend"><span>Planificado</span><span style="--dot:var(--surface-2)">Por organizar</span></div></section>
      <section class="card card-pad"><div class="card-head"><div><h3>Prioridades</h3><p>Lo siguiente que conviene resolver</p></div></div><div class="item-list">${
    pendingTasks.slice(0, 4).map(taskRow).join("") || emptyState("Todo listo", "No quedan tareas pendientes.")
  }</div></section>
      <section class="card card-pad"><div class="card-head"><div><h3>Compras pendientes</h3><p>${
    money(pendingPurchaseTotal)
  } previstos</p></div></div><div class="item-list">${
    pendingPurchases.slice(0, 3).map((item) =>
      `<div class="list-item"><span class="stat-icon red">${icon("bag")}</span><div class="list-item-main"><strong>${
        esc(item.product)
      }</strong><small>${esc(item.city || "Sin ciudad")} · ${
        primaryMoney(item.estimatedPrice, itemCurrency(item))
      }</small></div></div>`
    ).join("")
  }</div></section>
      <section class="card card-pad"><div class="card-head"><div><h3>Actividad reciente</h3><p>Cambios de todo el equipo</p></div></div><div class="activity-feed">${
    store.collection("logs").slice(0, 5).map(activityLogRow).join("") ||
    `<p class="cell-sub">Todavía no hay actividad.</p>`
  }</div></section>
    </aside></div>
  </div>`;
}

function statCard(iconName, label, value, meta, tone, valueIsHtml = false) {
  return `<section class="card stat-card"><div class="stat-top"><span>${
    esc(label)
  }</span><span class="stat-icon ${tone}">${icon(iconName)}</span></div><div><div class="stat-value">${
    valueIsHtml ? value : esc(value)
  }</div><div class="stat-meta">${esc(meta)}</div></div></section>`;
}

function avatar(user, extra = "") {
  const initials = String(user?.name || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return user?.avatarUrl
    ? `<span class="avatar ${extra}"><img src="${esc(user.avatarUrl)}" alt=""></span>`
    : `<span class="avatar ${extra}" title="${esc(user?.name || "")}">${esc(initials)}</span>`;
}

function relativeTime(value) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  const units = [[86400, "día"], [3600, "hora"], [60, "min"], [1, "s"]];
  const [size, label] = units.find(([size]) => seconds >= size) || units.at(-1);
  const amount = Math.floor(seconds / size);
  return `hace ${amount} ${label}${amount === 1 || label === "min" || label === "s" ? "" : "s"}`;
}

function activityLogRow(log) {
  const title = log.metadata?.title || log.entityType;
  const messages = {
    "entity.created": `añadió “${title}”`,
    "entity.updated": `actualizó “${title}”`,
    "entity.deleted": `eliminó “${title}”`,
    "member.joined": "se unió al viaje",
    "member.removed": "eliminó un miembro",
    "member.role_changed": "cambió los permisos de un miembro",
    "trip.updated": "actualizó la configuración del viaje",
    "trip.imported": "importó los datos del viaje",
    "trip.archive_imported": "importó un proyecto completo",
  };
  return `<div class="activity-row">${avatar({ name: log.userName, avatarUrl: log.avatarUrl })}<div><strong>${
    esc(log.userName)
  }</strong><span>${esc(messages[log.action] || "realizó un cambio")}</span><small>${
    relativeTime(log.createdAt)
  }</small></div></div>`;
}
function activityKindOf(item) {
  return item.activityKind ||
    (item.transportId ? "Transporte" : item.stayId ? "Hospedaje" : item.placeId ? "Lugar" : "General");
}
function activityDisplay(item) {
  const kind = activityKindOf(item);
  if (kind === "Lugar") {
    const place = store.collection("places").find(({ id }) => id === item.placeId);
    if (place) {
      const admission = `${place.admission || "Entrada no indicada"}${
        Number(place.ticketPrice || 0) ? ` · ${primaryMoney(place.ticketPrice, itemCurrency(place))}` : ""
      }`;
      return { kind, primary: place.name, secondary: [place.category, admission].filter(Boolean).join(" · ") };
    }
  }
  if (kind === "Hospedaje") {
    const stay = store.collection("stays").find(({ id }) => id === item.stayId);
    if (stay) {
      return {
        kind,
        primary: stay.name,
        secondary: `Check-in ${formatDate(stay.checkInDate)} · ${stay.checkInTime || "hora por confirmar"} · Maletas: ${
          (stay.luggageStorage || "Por confirmar").toLocaleLowerCase("es")
        }${stay.luggageNotes ? ` (${stay.luggageNotes})` : ""}${stay.reference ? ` · Ref. ${stay.reference}` : ""}`,
      };
    }
  }
  if (kind === "Transporte") {
    const transport = store.collection("transports").find(({ id }) => id === item.transportId);
    if (transport) {
      const arrival = transport.arrivalDate
        ? ` · llega ${formatDate(transport.arrivalDate)} ${transport.arrivalTime || ""}`
        : "";
      const details = [
        transport.operator,
        transport.seat ? `Asiento ${transport.seat}` : "",
        transport.reservation ? `Ref. ${transport.reservation}` : "",
      ]
        .filter(Boolean).join(" · ");
      return {
        kind,
        primary: `${transport.type || "Transporte"} · ${transport.origin} → ${transport.destination}`,
        secondary: `Sale ${formatDate(transport.departureDate)} ${
          transport.departureTime || "hora por confirmar"
        }${arrival}${details ? ` · ${details}` : ""}`,
      };
    }
  }
  return {
    kind: "General",
    primary: item.location || item.city || item.type || "Actividad general",
    secondary: item.type && item.type !== "Otro" ? item.type : "",
  };
}
function miniTimeline(items, showAction = true) {
  return items.length
    ? `<div class="timeline">${
      items.slice(0, 5).map((item) => {
        const display = activityDisplay(item);
        return `<div class="timeline-item"><div class="timeline-time">${
          esc(item.start)
        }</div><div class="timeline-line"><span class="timeline-dot"></span></div><div class="timeline-info"><strong>${
          esc(item.title)
        }</strong><small>${esc(display.primary)} · ${
          durationLabel(timeDiff(item.start, item.end))
        }</small></div></div>`;
      }).join("")
    }</div>`
    : emptyState(
      "Un día libre",
      "Aún no hay actividades. Déjalo para improvisar o añade un plan.",
      showAction
        ? `<button class="btn btn-primary" data-add="itinerary">${icon("plus")} Añadir actividad</button>`
        : "",
    );
}
function timeDiff(start, end) {
  const [a, b] = [start, end].map((time) => time?.split(":").map(Number) || [0, 0]);
  return (b[0] * 60 + b[1]) - (a[0] * 60 + a[1]);
}

function activitiesForDate(date) {
  const activities = store.collection("activities").filter((item) => item.date === date);
  const linkedStayIds = new Set(activities.map(({ stayId }) => stayId).filter(Boolean));
  const linkedTransportIds = new Set(activities.map(({ transportId }) => transportId).filter(Boolean));
  const stays = store.collection("stays").flatMap((stay) => [
    ...(stay.checkInDate === date && !linkedStayIds.has(stay.id)
      ? [{
        id: `virtual-in-${stay.id}`,
        virtual: true,
        activityKind: "Hospedaje",
        stayId: stay.id,
        title: `Check-in · ${stay.name}`,
        date,
        start: stay.checkInTime || "15:00",
        end: addMinutes(stay.checkInTime || "15:00", 30),
        type: "Check-in",
        city: stay.city,
        location: stay.address,
      }]
      : []),
    ...(stay.checkOutDate === date && !linkedStayIds.has(stay.id)
      ? [{
        id: `virtual-out-${stay.id}`,
        virtual: true,
        activityKind: "Hospedaje",
        stayId: stay.id,
        title: `Check-out · ${stay.name}`,
        date,
        start: stay.checkOutTime || "11:00",
        end: addMinutes(stay.checkOutTime || "11:00", 20),
        type: "Check-out",
        city: stay.city,
        location: stay.address,
      }]
      : []),
  ]);
  const transports = store.collection("transports").filter((item) =>
    item.departureDate === date && !linkedTransportIds.has(item.id)
  ).map((item) => ({
    id: `virtual-trans-${item.id}`,
    virtual: true,
    activityKind: "Transporte",
    transportId: item.id,
    title: `${item.type} · ${item.origin} → ${item.destination}`,
    date,
    start: item.departureTime,
    end: item.arrivalDate === date ? item.arrivalTime : "23:59",
    type: "Transporte",
    city: item.origin,
    location: item.operator,
    status: item.status,
  }));
  return [...activities, ...stays, ...transports];
}

function activityMapsButton(item) {
  if (item.virtual) return "";
  const url = activityGoogleMapsUrl(item, store.collection("places"));
  return url
    ? `<a class="btn btn-ghost icon-btn" data-activity-maps href="${
      esc(url)
    }" target="_blank" rel="noreferrer" aria-label="Abrir en Google Maps" title="Abrir en Google Maps">${
      icon("map")
    }</a>`
    : "";
}
function addMinutes(time, value) {
  const total = (Number(time.split(":")[0]) * 60 + Number(time.split(":")[1]) + value) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function renderItinerary() {
  const trip = store.activeTrip;
  const dates = dateRange(trip.startDate, trip.endDate);
  const date = activeDate();
  const items = activitiesForDate(date);
  const analysis = itineraryAnalysis(items);
  const conflictIds = new Set(analysis.conflicts.flatMap((item) => [item.first.id, item.second.id]));
  const view = ui.itineraryView;
  let body;
  if (view === "overview") {
    body = `<div class="grid grid-3">${
      dates.map((day, index) => {
        const list = activitiesForDate(day);
        return `<button class="card card-pad" style="text-align:left;cursor:pointer;color:inherit" data-go-date="${day}"><div class="card-head"><div><h3>Día ${
          index + 1
        }</h3><p>${fullDate(day)}</p></div>${
          badge(`${list.length} planes`, list.length > 7 ? "amber" : "green")
        }</div>${miniTimeline(list.slice(0, 3), false)}</button>`;
      }).join("")
    }</div>`;
  } else if (view === "week") {
    const index = dates.indexOf(date);
    const week = dates.slice(Math.floor(index / 7) * 7, Math.floor(index / 7) * 7 + 7);
    body = `<div class="grid itinerary-week-grid">${
      week.map((day) =>
        `<button class="card card-pad" style="text-align:left;cursor:pointer;color:inherit" data-go-date="${day}"><div class="card-head"><div><h3>${
          fullDate(day)
        }</h3><p>${activitiesForDate(day).length} actividades</p></div></div>${
          miniTimeline(activitiesForDate(day).slice(0, 4), false)
        }</button>`
      ).join("")
    }</div>`;
  } else {body = `<div class="planner-layout"><section class="card planner">${
      analysis.sorted.length
        ? analysis.sorted.map((item) => {
          const display = activityDisplay(item);
          return `<div class="planner-event"><div class="planner-time">${esc(item.start)}<br><small>${
            esc(item.end)
          }</small></div><div class="event-card ${conflictIds.has(item.id) ? "conflict" : ""}" ${
            item.virtual ? "" : `draggable="true" data-drag-id="${item.id}"`
          } data-edit-activity="${item.id}"><span class="drag-handle" title="${
            item.virtual ? "Elemento sincronizado" : "Arrastrar para reordenar"
          }">${item.virtual ? "•" : icon("grip")}</span><div class="event-body"><strong>${
            esc(item.title)
          }</strong><small>${esc(display.primary)} · ${durationLabel(timeDiff(item.start, item.end))}</small>${
            display.secondary ? `<span class="event-context">${esc(display.secondary)}</span>` : ""
          }</div>${activityMapsButton(item)}${
            item.virtual ? badge("Sincronizado", "blue") : badge(item.status === "done" ? "Realizado" : display.kind)
          }</div></div>`;
        }).join("")
        : emptyState(
          "Este día está por escribir",
          "Añade una actividad o conserva el espacio para improvisar.",
          `<button class="btn btn-primary" data-add="itinerary">${icon("plus")} Crear el primer plan</button>`,
        )
    }</section><aside class="section-stack planner-insights"><section class="card card-pad"><div class="card-head"><div><h3>Análisis del día</h3><p>${
      durationLabel(analysis.plannedMinutes)
    } planificados</p></div></div><div class="section-stack">${
      analysis.conflicts.length
        ? analysis.conflicts.map((c) =>
          `<div class="insight warning">${icon("alert")}<div><strong>Solapamiento de ${c.overlap} min</strong>${
            esc(c.first.title)
          } y ${esc(c.second.title)}</div></div>`
        ).join("")
        : `<div class="insight">${
          icon("check")
        }<div><strong>Horarios compatibles</strong>No hay actividades solapadas.</div></div>`
    }${
      analysis.warnings.map((warning) =>
        `<div class="insight warning">${icon("alert")}<div>${esc(warning)}</div></div>`
      ).join("")
    }</div></section><section class="card card-pad"><div class="card-head"><div><h3>Tiempo libre</h3><p>Huecos entre actividades</p></div></div><div class="item-list">${
      analysis.gaps.filter((g) => g.available >= 30).slice(0, 4).map((g) =>
        `<div class="list-item"><span class="stat-icon">${icon("clock")}</span><div class="list-item-main"><strong>${
          durationLabel(g.available)
        }</strong><small>Después de ${esc(g.first.title)}</small></div></div>`
      ).join("") || "<p style='color:var(--muted)'>No hay huecos de 30 minutos o más.</p>"
    }</div></section></aside></div>`;}
  return `<div class="toolbar"><div class="segmented"><button data-itinerary-view="day" class="${
    view === "day" ? "active" : ""
  }">☀️ Día</button><button data-itinerary-view="week" class="${
    view === "week" ? "active" : ""
  }">🗓️ Semana</button><button data-itinerary-view="overview" class="${
    view === "overview" ? "active" : ""
  }">🧭 General</button></div>${
    addAction("itinerary", "Añadir actividad")
  }</div><div class="day-strip" role="tablist" aria-label="Días del viaje">${
    dates.map((item) => {
      const parsed = new Date(`${item}T12:00`);
      const selected = item === date;
      return `<button class="day-button ${selected ? "active" : ""} ${
        item === todayIso() ? "today" : ""
      }" data-date="${item}" role="tab" aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}"><small>${
        new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(parsed)
      }</small><strong>${
        new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(parsed)
      }</strong></button>`;
    }).join("")
  }</div><div class="section-title"><div><h2>${fullDate(date)}</h2><p>Día ${
    dates.indexOf(date) + 1
  } de ${dates.length}</p></div></div>${body}`;
}

function renderPlaces() {
  const places = filtered(store.collection("places"), ["name", "city", "area", "category"]);
  const pendingPhotos = store.collection("places").filter((place) =>
    !place.photoUrl && !place.photoCheckedAt && googleMapsPlaceLink(place.link)
  );
  const photoAction = pendingPhotos.length && session.can(PERMISSIONS.TRIP_EDIT)
    ? `<button class="btn btn-secondary" type="button" data-complete-place-photos>${
      icon("image")
    } Obtener fotos de Maps (${pendingPhotos.length})</button>`
    : "";
  return `${
    toolbar(["Todos", ...CATEGORIES.place], `${photoAction}${addAction("places", "Añadir lugar")}`)
  }<div class="grid place-grid">${
    places.map((place) => {
      const background = resolvePlaceBackground(place, placeEmoji(place.category));
      const hasImage = background.type === "image";
      const coverSymbol = ["emoji", "fallback"].includes(background.type)
        ? background.value
        : place.backgroundEmoji || placeEmoji(place.category);
      const colorStyle = background.type === "color" ? ` style="--place-background:${esc(background.value)}"` : "";
      return `<article class="card place-card"><div class="place-cover ${hasImage ? "has-photo" : ""} ${
        background.type === "color" ? "has-color" : ""
      }"${colorStyle}>${
        hasImage
          ? `<img class="place-cover-photo" src="${esc(background.value)}" alt="Fondo de ${esc(place.name)}">`
          : ""
      }<span>${badge(place.status)}</span><span class="place-symbol">${esc(coverSymbol)}</span><span>${
        badge(place.priority, place.priority === "Alta" || place.priority === "Imprescindible" ? "red" : "")
      }</span>${
        hasImage && background.automatic
          ? `<a class="place-photo-credit" href="${
            esc(place.photoAttributionUrl || place.link || "#")
          }" target="_blank" rel="noreferrer">Foto: ${esc(place.photoAttributionName || "Google Maps")}</a>`
          : ""
      }</div><div class="place-body"><h3>${esc(place.name)}</h3><p>${
        esc(place.description || "Sin descripción")
      }</p><div class="place-admission">${badge(place.admission || "Entrada no indicada", "blue")}${
        Number(place.ticketPrice || 0) ? itemMoney(place.ticketPrice, place) : ""
      }</div><div class="place-meta"><span>${icon("pin")} ${esc(place.city)} · ${
        esc(place.area)
      }</span><button class="btn btn-ghost icon-btn" data-edit="places:${place.id}">${
        icon("edit")
      }</button></div></div></article>`;
    }).join("") || emptyState("No hay lugares", "Prueba otro filtro o añade un lugar nuevo.")
  }</div>`;
}
function placeEmoji(category) {
  return ({
    Templo: "⛩️",
    Restaurante: "🍜",
    Tienda: "🛍️",
    Museo: "🏛️",
    Parque: "🌿",
    Mirador: "🌇",
    Actividad: "✨",
    Cafetería: "☕",
  })[category] || "📍";
}

let googleMapsPromise;

function loadGoogleMaps(apiKey) {
  if (globalThis.google?.maps?.importLibrary) return Promise.resolve(globalThis.google.maps);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    globalThis.__tabiGoogleMapsReady = () => {
      delete globalThis.__tabiGoogleMapsReady;
      resolve(globalThis.google.maps);
    };
    const script = document.createElement("script");
    const parameters = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      libraries: "maps,marker,places",
      language: "es",
      region: "ES",
      callback: "__tabiGoogleMapsReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps no se ha podido cargar."));
    document.head.append(script);
  });
  return googleMapsPromise;
}

function googlePlaceCategory(type = "") {
  if (/restaurant|food/.test(type)) return "Restaurante";
  if (/cafe|coffee/.test(type)) return "Cafetería";
  if (/museum|art_gallery/.test(type)) return "Museo";
  if (/park|garden/.test(type)) return "Parque";
  if (/store|shopping|market/.test(type)) return "Tienda";
  if (/temple|church|shrine|place_of_worship/.test(type)) return "Templo";
  return "Actividad";
}

function googlePlaceCity(place) {
  const components = place.addressComponents || [];
  const component = components.find((item) =>
    item.types?.some((type) => ["locality", "postal_town", "administrative_area_level_2"].includes(type))
  );
  return component?.longText || component?.long_name || "Sin especificar";
}

function googlePlacePhoto(place) {
  const photo = place.photos?.[0];
  if (!photo?.getURI) return {};
  const attribution = photo.authorAttributions?.[0];
  return {
    photoUrl: photo.getURI({ maxWidth: 1200, maxHeight: 720 }),
    photoAttributionName: attribution?.displayName || "Google Maps",
    photoAttributionUrl: attribution?.uri || place.googleMapsURI || "",
  };
}

function googleMapsPlaceLink(value) {
  try {
    const host = new URL(value).hostname.toLocaleLowerCase("en");
    return host === "maps.app.goo.gl" || ((/^(?:www\.|maps\.)?google\.[a-z.]+$/.test(host) ||
      host.endsWith(".google.com")) && new URL(value).pathname.includes("/maps"));
  } catch {
    return false;
  }
}

async function completePlacePhotos(button) {
  const candidates = store.collection("places").filter((place) =>
    !place.photoUrl && !place.photoCheckedAt && googleMapsPlaceLink(place.link)
  );
  if (!candidates.length) return;
  button.disabled = true;
  let completed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    button.textContent = `Consultando Google Maps… ${completed + failed + 1}/${candidates.length}`;
    try {
      const { place } = await googlePlaceFromLink(candidate.link);
      const photo = googlePlacePhoto(place);
      await store.edit("places", candidate.id, { ...photo, photoCheckedAt: new Date().toISOString() });
      if (photo.photoUrl) completed++;
    } catch {
      failed++;
    }
  }
  toast(
    completed
      ? `${completed} ${completed === 1 ? "foto añadida" : "fotos añadidas"}${
        failed ? ` · ${failed} sin completar` : ""
      }`
      : "Google Maps no ha devuelto fotos para estos lugares.",
    completed ? "success" : "error",
  );
  render();
}

function setFormValue(root, name, value) {
  let field = root.querySelector(`#field-${name}`);
  if (!field) {
    field = document.createElement("input");
    field.type = "hidden";
    field.id = `field-${name}`;
    field.name = name;
    root.querySelector("form")?.append(field);
  }
  field.value = value ?? "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function savedPlaceIcon(place) {
  return place.markerIcon || placeEmoji(place.category) || "📍";
}

function placeDirectionsUrl(place) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lng}`)}`;
}

function mapSelectedDetails(place) {
  if (!place) return `<p class="cell-sub">Selecciona un marcador para ver la información del lugar.</p>`;
  return `<div class="map-selected-title"><span class="map-selected-icon">${
    esc(savedPlaceIcon(place))
  }</span><div><strong>${esc(place.name)}</strong><small>${esc(place.city || "")} ${
    place.area ? `· ${esc(place.area)}` : ""
  }</small></div></div><div class="map-selected-badges">${badge(place.category || "Lugar")} ${
    badge(place.status || "Pendiente")
  }</div><p>${esc(place.description || place.notes || "Sin notas añadidas.")}</p><small>${
    esc(place.address || "Dirección no disponible")
  }</small><div class="map-selected-actions"><a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${
    esc(placeDirectionsUrl(place))
  }">${icon("external")} Cómo llegar</a>${
    session.can(PERMISSIONS.TRIP_EDIT)
      ? `<button class="btn btn-secondary" type="button" data-edit="places:${place.id}" aria-label="Editar lugar">${
        icon("edit")
      } Editar</button>`
      : ""
  }</div>`;
}

function mapMarkerContent(place) {
  const marker = document.createElement("div");
  marker.className = "custom-map-marker";
  marker.textContent = savedPlaceIcon(place);
  marker.setAttribute("aria-label", place.name);
  return marker;
}

function mapInfoContent(place) {
  const content = document.createElement("div");
  content.className = "map-info-window";
  content.innerHTML = `<div>${badge(place.category || "Lugar")} ${badge(place.status || "Pendiente")}</div><p>${
    esc(place.description || place.notes || "Sin notas añadidas.")
  }</p><small>${esc(place.address || `${place.city || ""} ${place.area || ""}`.trim())}</small><a href="${
    esc(placeDirectionsUrl(place))
  }" target="_blank" rel="noreferrer">Abrir ruta en Google Maps</a>`;
  return content;
}

function setMapSidebarOpen(open) {
  ui.mapSidebarOpen = open;
  document.querySelector(".map-sidebar")?.classList.toggle("open", open);
  document.querySelector(".map-drawer-backdrop")?.classList.toggle("open", open);
  document.querySelector("[data-map-panel-toggle]")?.setAttribute("aria-expanded", String(open));
}

async function googlePlaceFromLink(value) {
  const resolved = (await apiClient.post("/maps/resolve", { url: value })).url;
  const config = await apiClient.get("/config/maps");
  if (!config.enabled) throw new Error("Configura Google Maps en el servidor para obtener los datos del lugar.");
  await loadGoogleMaps(config.apiKey);
  const { Place } = await google.maps.importLibrary("places");
  const search = googleMapsLinkSearch(resolved);
  let place;
  if (search.placeId) {
    place = new Place({ id: search.placeId });
    await place.fetchFields({
      fields: [
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "googleMapsURI",
        "addressComponents",
        "primaryType",
        "regularOpeningHours",
        "photos",
      ],
    });
  } else {
    const textQuery = search.query ||
      (Number.isFinite(search.lat) && Number.isFinite(search.lng) ? `${search.lat},${search.lng}` : "");
    if (!textQuery) throw new Error("No se ha podido identificar el lugar incluido en el enlace.");
    const result = await Place.searchByText({
      textQuery,
      fields: [
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "googleMapsURI",
        "addressComponents",
        "primaryType",
        "regularOpeningHours",
        "photos",
      ],
      maxResultCount: 1,
      language: "es",
    });
    place = result.places?.[0];
  }
  if (!place?.location) throw new Error("Google Maps no ha encontrado información para ese enlace.");
  return { place, resolved };
}

function initializePlaceLinkImport(root) {
  const input = root.querySelector("#field-link");
  if (!input) return;
  const initialLink = input.value;
  input.addEventListener("input", () => {
    if (input.value === initialLink) return;
    ["photoUrl", "photoAttributionName", "photoAttributionUrl", "photoCheckedAt"].forEach((name) =>
      setFormValue(root, name, "")
    );
  });
  input.insertAdjacentHTML(
    "afterend",
    `<button class="btn btn-secondary" type="button" data-import-google-link>${
      icon("map")
    } Obtener datos del enlace</button>`,
  );
  const button = root.querySelector("[data-import-google-link]");
  button.addEventListener("click", async () => {
    if (!input.reportValidity() || !input.value) return;
    button.disabled = true;
    const previousLabel = button.innerHTML;
    button.textContent = "Consultando Google Maps…";
    try {
      const { place, resolved } = await googlePlaceFromLink(input.value);
      const category = googlePlaceCategory(place.primaryType);
      const values = {
        name: place.displayName || "",
        city: googlePlaceCity(place),
        address: place.formattedAddress || "",
        category,
        markerIcon: placeEmoji(category),
        hours: place.regularOpeningHours?.weekdayDescriptions?.join(" · ") || "",
        lat: place.location.lat(),
        lng: place.location.lng(),
        link: place.googleMapsURI || resolved,
        ...googlePlacePhoto(place),
      };
      Object.entries(values).forEach(([name, value]) => {
        setFormValue(root, name, value);
      });
      toast("Datos del lugar completados");
    } catch (error) {
      toast(error.message || "No se han podido obtener los datos del enlace.", "error");
    } finally {
      button.disabled = false;
      button.innerHTML = previousLabel;
    }
  });
}

function initializePlaceDuplicateCheck(root, item) {
  const nameInput = root.querySelector("#field-name");
  const cityInput = root.querySelector("#field-city");
  const linkInput = root.querySelector("#field-link");
  if (!nameInput || !cityInput || !linkInput) return;
  const message = document.createElement("div");
  message.className = "duplicate-warning";
  message.hidden = true;
  linkInput.closest("[data-field]")?.insertAdjacentElement("afterend", message);
  const check = () => {
    nameInput.setCustomValidity("");
    linkInput.setCustomValidity("");
    const duplicate = findPlaceDuplicate(
      { name: nameInput.value, city: cityInput.value, link: linkInput.value },
      store.collection("places"),
      item?.id,
    );
    message.hidden = !duplicate;
    if (!duplicate) return;
    const reason = duplicate.reason === "link" ? "el mismo enlace de Google Maps" : "el mismo nombre y ciudad";
    message.innerHTML = `${icon("alert")}<span><strong>Posible duplicado:</strong> ya existe ${
      esc(duplicate.place.name)
    } con ${reason}.</span>`;
    (duplicate.reason === "link" ? linkInput : nameInput).setCustomValidity("Este lugar ya está guardado.");
  };
  [nameInput, cityInput, linkInput].forEach((input) => input.addEventListener("input", check));
  check();
}

function initializePlaceEditor(root, item) {
  initializePlaceLinkImport(root);
  initializePlaceDuplicateCheck(root, item);
  const mode = root.querySelector("#field-backgroundMode");
  const fieldsByMode = {
    [PLACE_BACKGROUND_MODES.IMAGE]: "backgroundImage",
    [PLACE_BACKGROUND_MODES.COLOR]: "backgroundColor",
    [PLACE_BACKGROUND_MODES.EMOJI]: "backgroundEmoji",
  };
  const updateAppearanceFields = () => {
    Object.values(fieldsByMode).forEach((name) => {
      const field = root.querySelector(`[data-field="${name}"]`);
      if (field) field.hidden = fieldsByMode[mode?.value] !== name;
    });
  };
  root.querySelector("#field-backgroundImage")?.addEventListener("input", () => {
    if (mode && root.querySelector("#field-backgroundImage")?.value) mode.value = PLACE_BACKGROUND_MODES.IMAGE;
    updateAppearanceFields();
  });
  root.querySelector("#field-backgroundColor")?.addEventListener("input", () => {
    if (mode) mode.value = PLACE_BACKGROUND_MODES.COLOR;
    updateAppearanceFields();
  });
  root.querySelector("#field-backgroundEmoji")?.addEventListener("input", () => {
    if (mode) mode.value = PLACE_BACKGROUND_MODES.EMOJI;
    updateAppearanceFields();
  });
  mode?.addEventListener("change", updateAppearanceFields);
  updateAppearanceFields();
}

function initializeActivityLinks(root) {
  const kindInput = root.querySelector("#field-activityKind");
  const stayInput = root.querySelector("#field-stayId");
  const transportInput = root.querySelector("#field-transportId");
  const placeInput = root.querySelector("#field-placeId");
  if (!kindInput || !stayInput || !transportInput || !placeInput) return;

  const placeField = root.querySelector('[data-field="placeId"]');
  const stayField = root.querySelector('[data-field="stayId"]');
  const transportField = root.querySelector('[data-field="transportId"]');
  const generalFields = ["type", "city", "location", "mapsUrl"].map((name) =>
    root.querySelector(`[data-field="${name}"]`)
  );
  const setValue = (name, value) => {
    const input = root.querySelector(`#field-${name}`);
    if (input && value !== undefined && value !== null && value !== "") input.value = value;
  };
  const updateLinkedFields = (clearOthers = false) => {
    const kind = kindInput.value;
    placeField.hidden = kind !== "Lugar";
    stayField.hidden = kind !== "Hospedaje";
    transportField.hidden = kind !== "Transporte";
    generalFields.forEach((field) => field.hidden = kind !== "General");
    placeInput.required = kind === "Lugar";
    stayInput.required = kind === "Hospedaje";
    transportInput.required = kind === "Transporte";
    if (kind !== "Lugar") root.querySelector("[data-quick-place]")?.setAttribute("hidden", "");
    if (clearOthers) {
      if (kind !== "Lugar") placeInput.value = "";
      if (kind !== "Hospedaje") stayInput.value = "";
      if (kind !== "Transporte") transportInput.value = "";
    }
  };

  kindInput.addEventListener("change", () => updateLinkedFields(true));
  stayInput.addEventListener("change", () => {
    const stay = store.collection("stays").find((item) => item.id === stayInput.value);
    if (!stay) return;
    const title = root.querySelector("#field-title");
    if (title && !title.value.trim()) title.value = `Check-in · ${stay.name}`;
    setValue("date", stay.checkInDate);
    const start = stay.checkInTime || "15:00";
    setValue("start", start);
    setValue("end", start < "23:30" ? addMinutes(start, 30) : "23:59");
    setValue("city", stay.city);
    setValue("location", stay.address || stay.name);
    root.querySelector("#field-mapsUrl").value = "";
  });
  transportInput.addEventListener("change", () => {
    const transport = store.collection("transports").find((item) => item.id === transportInput.value);
    if (!transport) return;
    const start = transport.departureTime || "09:00";
    const sameDayArrival = transport.arrivalDate === transport.departureDate && transport.arrivalTime > start;
    const title = root.querySelector("#field-title");
    if (title && !title.value.trim()) {
      title.value = `${transport.type || "Trayecto"} · ${transport.origin} → ${transport.destination}`;
    }
    setValue("date", transport.departureDate);
    setValue("start", start);
    setValue("end", sameDayArrival ? transport.arrivalTime : start < "23:00" ? addMinutes(start, 60) : "23:59");
    setValue("city", transport.origin);
    setValue("location", transport.operator || `${transport.origin} → ${transport.destination}`);
    root.querySelector("#field-mapsUrl").value = "";
  });
  const choosePlace = (place) => {
    let option = [...placeInput.options].find(({ value }) => value === place.id);
    if (!option) {
      option = new Option(place.name, place.id);
      placeInput.add(option);
    }
    placeInput.value = place.id;
    const title = root.querySelector("#field-title");
    if (title && !title.value.trim()) title.value = `Visita · ${place.name}`;
    root.querySelector("#field-location").value = place.name || "";
    root.querySelector("#field-city").value = place.city || "";
    root.querySelector("#field-mapsUrl").value = "";
  };
  placeInput.addEventListener("change", () => {
    const place = store.collection("places").find(({ id }) => id === placeInput.value);
    if (place) choosePlace(place);
  });

  placeField?.insertAdjacentHTML(
    "beforeend",
    `<button class="btn btn-secondary quick-place-toggle" type="button" data-quick-place-toggle>${
      icon("plus")
    } Crear un lugar sin salir</button>`,
  );
  placeField?.insertAdjacentHTML(
    "afterend",
    `<section class="quick-place full" data-quick-place hidden><div class="quick-place-head"><div><strong>Nuevo lugar</strong><span>Se guardará y quedará vinculado a esta actividad.</span></div><button class="btn btn-ghost icon-btn" type="button" data-quick-place-close aria-label="Cerrar">${
      icon("close")
    }</button></div><div class="form-grid"><div class="field full"><label for="quick-place-name">Nombre *</label><input id="quick-place-name" type="text" placeholder="Ej. Sensō-ji"></div><div class="field"><label for="quick-place-city">Ciudad *</label><input id="quick-place-city" type="text" placeholder="Tokio"></div><div class="field"><label for="quick-place-link">Google Maps</label><input id="quick-place-link" type="text" inputmode="url" placeholder="https://maps.app.goo.gl/…"></div></div><div class="quick-place-actions"><button class="btn btn-secondary" type="button" data-quick-place-import>${
      icon("map")
    } Obtener datos</button><button class="btn btn-primary" type="button" data-quick-place-save>${
      icon("plus")
    } Crear y vincular</button></div></section>`,
  );
  const quickPanel = root.querySelector("[data-quick-place]");
  const quickName = root.querySelector("#quick-place-name");
  const quickCity = root.querySelector("#quick-place-city");
  const quickLink = root.querySelector("#quick-place-link");
  let importedValues = {};
  quickLink.addEventListener("input", () => importedValues = {});
  const toggleQuickPlace = (open) => {
    quickPanel.hidden = !open;
    if (open) {
      quickName.value ||= root.querySelector("#field-location")?.value || root.querySelector("#field-title")?.value ||
        "";
      quickCity.value ||= root.querySelector("#field-city")?.value || "";
      quickLink.value ||= root.querySelector("#field-mapsUrl")?.value || "";
      quickName.focus();
    }
  };
  root.querySelector("[data-quick-place-toggle]")?.addEventListener("click", () => toggleQuickPlace(true));
  root.querySelector("[data-quick-place-close]")?.addEventListener("click", () => toggleQuickPlace(false));
  root.querySelector("[data-quick-place-import]")?.addEventListener("click", async (event) => {
    if (!quickLink.value.trim()) return toast("Pega primero un enlace de Google Maps.", "error");
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { place, resolved } = await googlePlaceFromLink(quickLink.value);
      const category = googlePlaceCategory(place.primaryType);
      importedValues = {
        category,
        markerIcon: placeEmoji(category),
        address: place.formattedAddress || "",
        hours: place.regularOpeningHours?.weekdayDescriptions?.join(" · ") || "",
        lat: place.location.lat(),
        lng: place.location.lng(),
        ...googlePlacePhoto(place),
      };
      quickName.value = place.displayName || quickName.value;
      quickCity.value = googlePlaceCity(place) || quickCity.value;
      quickLink.value = place.googleMapsURI || resolved;
      toast("Datos del lugar completados");
    } catch (error) {
      toast(error.message || "No se han podido obtener los datos.", "error");
    } finally {
      button.disabled = false;
    }
  });
  root.querySelector("[data-quick-place-save]")?.addEventListener("click", async (event) => {
    const candidate = {
      name: quickName.value.trim(),
      city: quickCity.value.trim(),
      link: quickLink.value.trim(),
      status: "Pendiente",
      priority: "Media",
      duration: 60,
      markerIcon: "📍",
      ...importedValues,
    };
    if (!candidate.name || !candidate.city) return toast("Indica el nombre y la ciudad del lugar.", "error");
    const existing = findPlaceDuplicate(candidate, store.collection("places"));
    if (existing) {
      choosePlace(existing.place);
      toggleQuickPlace(false);
      return toast(`Ya existía “${existing.place.name}”; lo hemos vinculado.`);
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const place = await store.add("places", candidate);
      choosePlace(place);
      toggleQuickPlace(false);
      toast("Lugar creado y vinculado");
    } catch (error) {
      const duplicate = error instanceof ApiError && error.code === "PLACE_EXISTS"
        ? store.collection("places").find(({ id }) => id === error.details?.duplicateId)
        : null;
      if (duplicate) {
        choosePlace(duplicate);
        toggleQuickPlace(false);
        toast(`Ya existía “${duplicate.name}”; lo hemos vinculado.`);
      } else toast(error.message || "No se ha podido crear el lugar.", "error");
    } finally {
      button.disabled = false;
    }
  });
  updateLinkedFields();
}

function initializeStayFields(root) {
  const checkIn = root.querySelector("#field-checkInDate");
  const checkOut = root.querySelector("#field-checkOutDate");
  const platform = root.querySelector("#field-platform");
  const link = root.querySelector("#field-link");
  checkIn?.addEventListener("change", () => {
    if (checkIn.value && (!checkOut.value || checkOut.value < checkIn.value)) {
      checkOut.value = addDaysIso(checkIn.value, 1);
    }
  });
  platform?.addEventListener("change", () => {
    if (!link) return;
    link.placeholder = platform.value === "Airbnb"
      ? "https://www.airbnb.es/trips/…"
      : platform.value === "Booking"
      ? "https://secure.booking.com/…"
      : "https://…";
  });
  platform?.dispatchEvent(new Event("change"));
  initializePaymentFields(root);
}

function initializePaymentFields(root) {
  const price = root.querySelector("#field-price");
  const paidAmount = root.querySelector("#field-paidAmount");
  const paymentStatus = root.querySelector("#field-paymentStatus");
  const syncPayment = (source) => {
    const total = Math.max(0, Number(price?.value || 0));
    const paid = Math.max(0, Number(paidAmount?.value || 0));
    if (source === paymentStatus) {
      if (paymentStatus.value === "Pagado") paidAmount.value = total;
      if (paymentStatus.value === "Pendiente") paidAmount.value = 0;
      return;
    }
    if (source === price && paymentStatus?.value === "Pagado") {
      paidAmount.value = total;
    } else if (paidAmount && paymentStatus) {
      paymentStatus.value = paid > 0 && paid >= total && total > 0 ? "Pagado" : paid > 0 ? "Parcial" : "Pendiente";
    }
  };
  price?.addEventListener("input", () => syncPayment(price));
  paidAmount?.addEventListener("input", () => syncPayment(paidAmount));
  paymentStatus?.addEventListener("change", () => syncPayment(paymentStatus));
  if (paymentStatus?.value === "Pagado" && !Number(paidAmount?.value || 0)) syncPayment(paymentStatus);
}

function initializePurchaseFields(root) {
  const actualPrice = root.querySelector("#field-actualPrice");
  const status = root.querySelector("#field-status");
  const purchaseDate = root.querySelector("#field-purchaseDate");
  const syncPurchase = () => {
    if (Number(actualPrice?.value || 0) <= 0 || !status) return;
    status.value = "Comprado";
    if (purchaseDate && !purchaseDate.value) purchaseDate.value = todayIso();
  };
  actualPrice?.addEventListener("input", syncPurchase);
  actualPrice?.addEventListener("change", syncPurchase);
  syncPurchase();
}

function initializeTransportFields(root) {
  const departureDate = root.querySelector("#field-departureDate");
  const departureTime = root.querySelector("#field-departureTime");
  const arrivalDate = root.querySelector("#field-arrivalDate");
  const arrivalTime = root.querySelector("#field-arrivalTime");
  const duration = root.querySelector("#field-duration");
  const calculate = () => {
    if (!departureDate.value || !departureTime.value || !arrivalDate.value || !arrivalTime.value) return;
    const minutes = Math.round(
      (Date.parse(`${arrivalDate.value}T${arrivalTime.value}:00Z`) -
        Date.parse(`${departureDate.value}T${departureTime.value}:00Z`)) / 60000,
    );
    if (minutes >= 0) duration.value = minutes;
  };
  [departureDate, departureTime, arrivalDate, arrivalTime].forEach((input) =>
    input?.addEventListener("change", calculate)
  );
  initializePaymentFields(root);
}

async function initializeGoogleMap() {
  const canvas = document.querySelector("#google-map");
  const searchHost = document.querySelector("#google-place-search");
  if (!canvas || !searchHost) return;
  const config = await apiClient.get("/config/maps");
  if (!config.enabled) {
    canvas.innerHTML = `<div class="map-message">${
      icon("map")
    }<h3>Google Maps necesita configuración</h3><p>Añade <code>TABI_GOOGLE_MAPS_API_KEY</code> y <code>TABI_GOOGLE_MAPS_MAP_ID</code> al archivo <code>.env</code> del servidor.</p></div>`;
    searchHost.innerHTML = `<p class="cell-sub">Configura Google Maps para buscar lugares.</p>`;
    return;
  }
  await loadGoogleMaps(config.apiKey);
  const [{ Map, InfoWindow }, { AdvancedMarkerElement }, { PlaceAutocompleteElement }] = await Promise.all([
    google.maps.importLibrary("maps"),
    google.maps.importLibrary("marker"),
    google.maps.importLibrary("places"),
  ]);
  if (!canvas.isConnected) return;
  const places = store.collection("places").filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
  const map = new Map(canvas, {
    center: { lat: 36.2048, lng: 138.2529 },
    zoom: 5,
    mapId: config.mapId,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });
  const bounds = new google.maps.LatLngBounds();
  const infoWindow = new InfoWindow({ maxWidth: 320 });
  const markers = new globalThis.Map();
  const clearSelectedPlace = () => {
    ui.mapPlaceId = "";
    markers.forEach(({ content }) => content.classList.remove("selected"));
    document.querySelectorAll("[data-map-place]").forEach((button) => button.classList.remove("active"));
    document.querySelectorAll("[data-map-selected]").forEach((host) => {
      host.hidden = true;
      host.innerHTML = "";
    });
    infoWindow.close();
  };
  const selectPlace = (place, marker) => {
    ui.mapPlaceId = place.id;
    markers.forEach((item, id) => item.content.classList.toggle("selected", id === place.id));
    document.querySelectorAll("[data-map-place]").forEach((button) =>
      button.classList.toggle("active", button.dataset.mapPlace === place.id)
    );
    const selectedRow = document.querySelector(`[data-map-place="${place.id}"]`);
    selectedRow?.parentElement?.prepend(selectedRow);
    document.querySelectorAll("[data-map-selected]").forEach((host) => {
      host.hidden = false;
      host.innerHTML = mapSelectedDetails(place);
    });
    document.querySelectorAll("[data-map-selected] [data-edit]").forEach((button) =>
      button.addEventListener("click", () => openEditor("places", place.id))
    );
    const heading = document.createElement("strong");
    heading.className = "map-info-title";
    heading.textContent = `${savedPlaceIcon(place)} ${place.name}`;
    infoWindow.setHeaderContent(heading);
    infoWindow.setContent(mapInfoContent(place));
    infoWindow.open({ anchor: marker, map, shouldFocus: false });
    map.panTo(marker.position);
    setMapSidebarOpen(false);
  };
  map.addListener("click", (event) => {
    event.stop?.();
    clearSelectedPlace();
  });
  infoWindow.addListener("closeclick", clearSelectedPlace);
  places.forEach((place) => {
    const position = { lat: place.lat, lng: place.lng };
    bounds.extend(position);
    const content = mapMarkerContent(place);
    const marker = new AdvancedMarkerElement({
      map,
      position,
      title: place.name,
      content,
    });
    markers.set(place.id, { marker, content });
    marker.addListener("click", () => selectPlace(place, marker));
  });
  if (places.length === 1) {
    map.setCenter({ lat: places[0].lat, lng: places[0].lng });
    map.setZoom(14);
  } else if (places.length > 1) {
    map.fitBounds(bounds, 70);
  }
  const selectedPlace = places.find(({ id }) => id === ui.mapPlaceId);
  if (selectedPlace) selectPlace(selectedPlace, markers.get(selectedPlace.id).marker);

  const autocomplete = new PlaceAutocompleteElement();
  autocomplete.placeholder = "Busca un sitio en Google Maps";
  searchHost.replaceChildren(autocomplete);
  autocomplete.addEventListener("gmp-select", async ({ placePrediction }) => {
    const place = placePrediction.toPlace();
    await place.fetchFields({
      fields: [
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "viewport",
        "googleMapsURI",
        "addressComponents",
        "primaryType",
        "photos",
      ],
    });
    if (!place.location || !document.querySelector("#google-map")) return;
    if (place.viewport) map.fitBounds(place.viewport);
    else {
      map.setCenter(place.location);
      map.setZoom(16);
    }
    new AdvancedMarkerElement({ map, position: place.location, title: place.displayName });
    const preview = document.querySelector("#google-place-preview");
    if (!preview) return;
    const photo = googlePlacePhoto(place);
    preview.innerHTML = `<div class="map-place-preview">${
      photo.photoUrl ? `<img src="${esc(photo.photoUrl)}" alt="${esc(place.displayName || "Lugar")}">` : ""
    }<strong>${esc(place.displayName || "Lugar")}</strong><small>${
      esc(place.formattedAddress || "Dirección no disponible")
    }</small>${
      session.can(PERMISSIONS.TRIP_EDIT)
        ? `<button class="btn btn-primary" type="button" data-save-google-place>${
          icon("plus")
        } Guardar en el viaje</button>`
        : `<span class="cell-sub">No tienes permiso para guardar lugares.</span>`
    }</div>`;
    preview.querySelector("[data-save-google-place]")?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      const duplicate = store.collection("places").find((item) =>
        (place.id && item.googlePlaceId === place.id) ||
        (item.name === place.displayName && Number(item.lat) === place.location.lat() &&
          Number(item.lng) === place.location.lng())
      );
      if (duplicate) {
        ui.mapPlaceId = duplicate.id;
        toast("Este lugar ya está guardado");
        render();
        return;
      }
      try {
        const saved = await store.add("places", {
          name: place.displayName || "Lugar sin nombre",
          city: googlePlaceCity(place),
          area: "",
          category: googlePlaceCategory(place.primaryType),
          markerIcon: placeEmoji(googlePlaceCategory(place.primaryType)),
          status: "Pendiente",
          address: place.formattedAddress || "",
          lat: place.location.lat(),
          lng: place.location.lng(),
          link: place.googleMapsURI || "",
          googlePlaceId: place.id || "",
          ...photo,
        });
        ui.mapPlaceId = saved.id;
        toast("Lugar guardado en el viaje");
        render();
      } catch (error) {
        event.currentTarget.disabled = false;
        toast(error.message, "error");
      }
    });
  });
}

function renderMap() {
  const places = store.collection("places").filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const selected = places.find((p) => p.id === ui.mapPlaceId) || null;
  if (!selected) ui.mapPlaceId = "";
  const orderedPlaces = selected ? [selected, ...places.filter((place) => place.id !== selected.id)] : places;
  return `<section class="card map-layout"><aside class="map-sidebar ${
    ui.mapSidebarOpen ? "open" : ""
  }"><div class="map-sidebar-head"><strong>Explorar lugares</strong><button class="btn btn-ghost icon-btn" type="button" data-map-panel-close aria-label="Cerrar lista">${
    icon("close")
  }</button></div><div id="google-place-search" class="google-place-search"><span class="cell-sub">Cargando buscador…</span></div><div id="google-place-preview"></div><div class="map-selected" data-map-selected ${
    selected ? "" : "hidden"
  }>${
    mapSelectedDetails(selected)
  }</div><div class="map-saved-head"><strong>Sitios guardados</strong><span>${places.length}</span></div><div class="item-list map-place-list">${
    orderedPlaces.map((p) =>
      `<button class="list-item ${
        p.id === selected?.id ? "active" : ""
      }" style="cursor:pointer;text-align:left;color:inherit" data-map-place="${p.id}"><span class="map-list-icon">${
        esc(savedPlaceIcon(p))
      }</span><span class="list-item-main"><strong>${esc(p.name)}</strong><small>${esc(p.city)} · ${
        esc(p.area)
      }</small></span>${icon("chevron")}</button>`
    ).join("") || `<p class="cell-sub">Busca un sitio arriba para añadirlo al viaje.</p>`
  }</div></aside><button class="map-drawer-backdrop ${
    ui.mapSidebarOpen ? "open" : ""
  }" type="button" data-map-panel-close aria-label="Cerrar lista de lugares"></button><div class="map-stage"><button class="btn btn-secondary map-panel-toggle" type="button" data-map-panel-toggle aria-expanded="${ui.mapSidebarOpen}">${
    icon("menu")
  } Lugares (${places.length})</button><div id="google-map" class="map-canvas"><div class="map-message"><span class="spinner"></span><p>Cargando Google Maps…</p></div></div><div class="map-mobile-selected" data-map-selected ${
    selected ? "" : "hidden"
  }>${mapSelectedDetails(selected)}</div></div></section>`;
}

function toolbar(filters = [], extra = "") {
  return `<div class="toolbar"><div class="search">${icon("search")}<input data-search placeholder="Buscar…" value="${
    esc(ui.query)
  }"></div>${
    filters.length
      ? `<div class="filter-control">${icon("filter")}<select data-filter aria-label="Filtrar resultados">${
        filters.map((f) =>
          `<option value="${esc(f)}" ${ui.filter === f ? "selected" : ""}>${esc(visualLabel(f))}</option>`
        ).join("")
      }</select></div>`
      : ""
  }${extra}</div>`;
}
function addAction(route, label, permission = PERMISSIONS.TRIP_EDIT) {
  return session.can(permission)
    ? `<button class="btn btn-primary section-add" type="button" data-add="${route}">${icon("plus")} ${
      esc(label)
    }</button>`
    : "";
}
function filtered(items, keys) {
  const query = searchKey(ui.query);
  return items.filter((item) =>
    (ui.filter === "Todos" || Object.values(item).includes(ui.filter)) &&
    (!query || keys.some((key) => searchKey(item[key]).includes(query)))
  );
}
function table(headers, rows, emptyTitle = "No hay datos") {
  return `<section class="card"><div class="table-wrap"><table class="data-table"><thead><tr>${
    headers.map((h) => `<th>${esc(h)}</th>`).join("")
  }<th></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>${
    rows.length ? "" : emptyState(emptyTitle, "Añade el primer elemento para empezar.")
  }</section>`;
}
function actions(collection, id) {
  return `<div class="row-actions"><button class="btn btn-ghost icon-btn" data-edit="${collection}:${id}" aria-label="Editar">${
    icon("edit")
  }</button></div>`;
}
function copyReferenceButton(collection, item, field = "reference") {
  return item[field]
    ? `<button class="btn btn-ghost icon-btn" type="button" data-copy-reference="${collection}:${item.id}:${field}" aria-label="Copiar referencia" title="Copiar referencia">${
      icon("file")
    }</button>`
    : "";
}

function renderPurchases() {
  const items = filtered(store.collection("purchases"), ["product", "city", "store", "recipient"]);
  const planned = items.reduce((sum, item) => sum + itemToPrimary(item.estimatedPrice, item), 0);
  const spent = items.reduce((sum, item) => sum + itemToPrimary(item.actualPrice, item), 0);
  return `<div class="grid grid-3" style="margin-bottom:18px">${
    statCard(
      "bag",
      "Artículos",
      items.length,
      `${items.filter((i) => i.status === "Comprado").length} comprados`,
      "red",
    )
  }${statCard("wallet", "Presupuesto previsto", money(planned), "Lista completa", "", true)}${
    statCard("check", "Gastado", money(spent), `${primaryMoney(Math.max(0, planned - spent))} disponible`, "", true)
  }</div>${
    toolbar(["Todos", "Pendiente", "Encontrado", "Comprado", "No encontrado"], addAction("purchases", "Añadir compra"))
  }${
    table(
      ["Producto", "Destino", "Estimado / pagado", "Prioridad", "Estado"],
      items.map((i) =>
        `<tr><td><div class="purchase-product">${
          i.photo
            ? `<button class="purchase-photo-button" type="button" data-lightbox="purchase-${
              esc(i.id)
            }" aria-label="Ampliar foto de ${esc(i.product)}"><img src="${esc(i.photo)}" alt="Foto de ${
              esc(i.product)
            }"></button>`
            : `<span class="purchase-photo-placeholder">${icon("bag")}</span>`
        }<span><span class="cell-main">${esc(i.product)}</span><span class="cell-sub">${esc(i.category)} · para ${
          esc(i.recipient || "—")
        }</span></span></div></td><td>${esc(i.city || "—")}<span class="cell-sub">${
          esc(i.store || "")
        }</span></td><td>${itemMoney(i.estimatedPrice, i)}<span class="cell-sub">pagado ${
          primaryMoney(i.actualPrice, itemCurrency(i))
        } · máx. ${primaryMoney(i.maxBudget, itemCurrency(i))}</span></td><td>${
          badge(i.priority, i.priority === "Alta" ? "red" : "")
        }</td><td>${badge(i.status)}</td><td>${actions("purchases", i.id)}</td></tr>`
      ),
      "No hay compras",
    )
  }`;
}

function taskRow(task) {
  const overdue = task.status !== "Completada" && task.dueDate && task.dueDate < todayIso();
  return `<div class="list-item"><button class="check ${
    task.status === "Completada" ? "checked" : ""
  }" data-toggle-task="${task.id}" aria-label="${
    task.status === "Completada" ? "Marcar como pendiente" : "Marcar como completada"
  }">${task.status === "Completada" ? icon("check") : ""}</button><div class="list-item-main ${
    task.status === "Completada" ? "done" : ""
  }"><strong>${esc(task.title)}</strong>${task.notes ? `<span>${esc(task.notes)}</span>` : ""}<small>${
    esc(task.category || "Sin categoría")
  } · ${esc(memberName(task.assigneeId))}${
    task.dueDate ? ` · ${overdue ? "Venció" : "Límite"} ${formatDate(task.dueDate)}` : ""
  }</small></div>${
    badge(task.priority, task.priority === "Alta" ? "red" : "")
  }<button class="btn btn-ghost icon-btn" data-edit="tasks:${task.id}">${icon("edit")}</button></div>`;
}
function renderTasks() {
  const enriched = store.collection("tasks").map((task) => ({
    ...task,
    assigneeName: memberName(task.assigneeId, ""),
  }));
  const items = filtered(enriched, ["title", "category", "notes", "assigneeName"])
    .sort((a, b) =>
      Number(a.status === "Completada") - Number(b.status === "Completada") ||
      String(a.dueDate || "9999-12-31").localeCompare(String(b.dueDate || "9999-12-31")) ||
      String(a.title).localeCompare(String(b.title), "es")
    );
  const pending = store.collection("tasks").filter((task) => task.status !== "Completada").length;
  const overdue =
    store.collection("tasks").filter((task) =>
      task.status !== "Completada" && task.dueDate && task.dueDate < todayIso()
    ).length;
  return `${
    toolbar(["Todos", "Pendiente", "Completada", "Alta", "Media", "Baja"], addAction("tasks", "Añadir TODO"))
  }<section class="card card-pad"><div class="card-head"><div><h2>Lista TODO</h2><p>${pending} pendientes${
    overdue ? ` · ${overdue} vencidas` : ""
  }</p></div></div><div class="item-list todo-list">${
    items.map(taskRow).join("") || emptyState("Todo al día", "No hay tareas que coincidan con la búsqueda.")
  }</div></section>`;
}

function orderedNotes() {
  return [...store.collection("notes")].sort((a, b) =>
    Number(a.order || 0) - Number(b.order || 0) || String(a.createdAt || "").localeCompare(b.createdAt || "")
  );
}

function renderNotes() {
  const notes = orderedNotes().filter((note) =>
    !ui.query || searchKey(`${note.title} ${note.content}`).includes(searchKey(ui.query))
  );
  return `${toolbar([], addAction("notes", "Añadir nota"))}<div class="note-list">${
    notes.map((note, index) =>
      `<article class="card note-card"><div class="note-order"><span>${
        index + 1
      }</span><button class="btn btn-ghost icon-btn" type="button" data-note-move="${note.id}:up" aria-label="Subir nota" title="Subir" ${
        index === 0 ? "disabled" : ""
      }>${
        icon("up")
      }</button><button class="btn btn-ghost icon-btn" type="button" data-note-move="${note.id}:down" aria-label="Bajar nota" title="Bajar" ${
        index === notes.length - 1 ? "disabled" : ""
      }>${icon("down")}</button></div><div class="note-body"><h3>${esc(note.title)}</h3><p>${
        esc(note.content || "Nota vacía")
      }</p><small>Actualizada ${
        formatDate(note.updatedAt, { year: "numeric" })
      }</small></div><button class="btn btn-ghost icon-btn note-edit" data-edit="notes:${note.id}" aria-label="Editar nota">${
        icon("edit")
      }</button></article>`
    ).join("") ||
    emptyState(
      "Todavía no hay notas",
      "Guarda ideas, recordatorios o cualquier texto útil para el viaje.",
      session.can(PERMISSIONS.TRIP_EDIT)
        ? `<button class="btn btn-primary" data-add="notes">${icon("plus")} Crear una nota</button>`
        : "",
    )
  }</div>`;
}

function renderBudget() {
  const expenses = normalizedExpenses(),
    purchases = normalizedPurchases(),
    funds = store.collection("funds"),
    stays = normalizedStays(),
    transports = normalizedTransports(),
    summary = budgetSummary(normalizedBudgetTrip(), expenses, purchases, normalizedFunds(), stays, transports),
    percent = Math.min(100, summary.spent / Math.max(1, summary.budget) * 100),
    totals = groupTotals(budgetChartItems(expenses, purchases, stays, transports), "category"),
    max = Math.max(...totals.map(([, v]) => v), 1);
  const items = filtered(
    store.collection("expenses").map((expense) => ({
      ...expense,
      paidByName: memberName(expense.paidByUserId, expense.person || "Fondo común"),
    })),
    ["title", "category", "city", "paidByName"],
  );
  return `<div class="grid dashboard-grid"><div class="section-stack"><section class="card card-pad budget-hero"><div><span class="hero-eyebrow" style="color:var(--muted)">Fondos disponibles</span><div class="stat-value" style="font-size:36px">${
    money(summary.remaining)
  }</div><p style="color:var(--muted)">de ${primaryMoney(summary.budget)} · base ${
    primaryMoney(summary.baseBudget)
  } + aportaciones ${primaryMoney(summary.funded)}</p><div class="legend"><span style="--dot:var(--primary)">Gastado ${
    primaryMoney(summary.spent)
  }</span><span style="--dot:var(--warning)">Comprometido ${
    primaryMoney(summary.committed)
  }</span></div></div><div class="ring" style="--value:${percent}%"><div class="ring-label">${
    Math.round(percent)
  }%<small>utilizado</small></div></div></section><div class="grid grid-4">${
    statCard("wallet", "Fondos aportados", money(summary.funded), `${funds.length} aportaciones`, "", true)
  }${
    statCard(
      "users",
      "Por persona",
      money(summary.perPerson),
      `Incluye ${primaryMoney(summary.lodgingSpent)} de alojamiento y ${
        primaryMoney(summary.transportSpent)
      } de transporte`,
      "",
      true,
    )
  }${
    statCard(
      "clock",
      "Pendiente de pagar",
      money(summary.committed),
      `${primaryMoney(summary.lodgingCommitted)} de alojamiento · ${
        primaryMoney(summary.transportCommitted)
      } de transporte`,
      "amber",
      true,
    )
  }${
    statCard("bag", "Compras previstas", money(summary.shoppingPlanned), "Aún no compradas", "red", true)
  }</div></div><section class="card card-pad"><div class="card-head"><div><h2>Distribución</h2><p>Gasto real por categoría</p></div></div><div class="chart-bars">${
    totals.map(([l, v]) =>
      `<div class="chart-column"><div class="chart-bar" style="height:${v / max * 100}%" data-value="${
        primaryMoney(v)
      }"></div><span class="chart-label">${esc(l)}</span></div>`
    ).join("")
  }</div></section></div><div class="section-title"><div><h2>Fondos del viaje</h2><p>Aportaciones que aumentan el presupuesto disponible</p></div>${
    session.can(PERMISSIONS.BUDGET_EDIT)
      ? `<button class="btn btn-primary" data-add-fund>${icon("plus")} Añadir fondos</button>`
      : ""
  }</div>${
    table(
      ["Concepto", "Aportado por", "Fecha", "Importe"],
      funds.map((fund) =>
        `<tr><td><span class="cell-main">${esc(fund.title)}</span><span class="cell-sub">${
          esc(fund.notes || "Aportación al viaje")
        }</span></td><td>${esc(fund.contributor)}</td><td>${formatDate(fund.date)}</td><td>${
          itemMoney(fund.amount, fund)
        }</td><td>${actions("funds", fund.id)}</td></tr>`
      ),
      "Todavía no hay fondos aportados",
    )
  }<div class="section-title"><div><h2>Movimientos</h2><p>Previsto frente a pagado</p></div></div>${
    toolbar(["Todos", ...CATEGORIES.expense], addAction("budget", "Añadir gasto", PERMISSIONS.BUDGET_EDIT))
  }${
    table(
      ["Concepto", "Fecha", "Pagado por", "Previsto", "Pagado", "Estado"],
      items.map((i) =>
        `<tr><td><span class="cell-main">${esc(i.title)}</span><span class="cell-sub">${esc(i.category)} · ${
          esc(i.city || "Sin ciudad")
        }</span></td><td>${formatDate(i.date)}</td><td>${esc(i.paidByName)}</td><td>${
          itemMoney(i.estimatedAmount, i)
        }</td><td>${itemMoney(i.actualAmount, i)}</td><td>${badge(i.paymentStatus)}</td><td>${
          actions("expenses", i.id)
        }</td></tr>`
      ),
      "No hay movimientos",
    )
  }`;
}

function bookingPlatform(platform = "Otros") {
  const key = { Airbnb: "airbnb", Booking: "booking", "En persona": "person" }[platform] || "other";
  const mark = key === "airbnb" ? "A" : key === "booking" ? "B." : icon(key === "person" ? "users" : "ticket");
  return `<span class="platform-badge platform-${key}"><span class="platform-mark" aria-hidden="true">${mark}</span>${
    esc(platform)
  }</span>`;
}

function renderStays() {
  const items = filtered(store.collection("stays"), ["name", "city", "address", "reference", "platform", "contact"])
    .sort((a, b) =>
      `${a.checkInDate || "9999"}${a.checkInTime || ""}`.localeCompare(
        `${b.checkInDate || "9999"}${b.checkInTime || ""}`,
      )
    );
  return `${
    toolbar(
      ["Todos", "En persona", "Airbnb", "Booking", "Otros", "Pendiente", "Confirmada", "Cancelada"],
      addAction("stays", "Añadir alojamiento"),
    )
  }<div class="grid grid-2">${
    items.map((i) => {
      const nights = stayNights(i);
      const cancellationExpired = i.cancellationDeadline && i.cancellationDeadline < todayIso();
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${
        encodeURIComponent(
          [i.address, i.city].filter(Boolean).join(", "),
        )
      }`;
      return `<section class="card card-pad stay-card"><div class="card-head"><div><div class="stay-badges">${
        bookingPlatform(i.platform || "Otros")
      } ${badge(i.bookingStatus || "Pendiente")}</div><h2>${esc(i.name)}</h2><p>${icon("pin")} ${esc(i.city)}${
        i.address ? ` · ${esc(i.address)}` : ""
      }</p></div>${
        badge(i.paymentStatus || "Pendiente")
      }</div><div class="grid grid-2"><div><span class="cell-sub">ENTRADA</span><strong>${
        formatDate(i.checkInDate)
      } · ${esc(i.checkInTime || "—")}</strong></div><div><span class="cell-sub">SALIDA</span><strong>${
        formatDate(i.checkOutDate)
      } · ${esc(i.checkOutTime || "—")}</strong></div></div><div class="stay-summary"><strong>${nights} ${
        nights === 1 ? "noche" : "noches"
      }</strong><span>${itemMoney(i.price, i)}${
        nights ? ` · ${primaryMoney(Number(i.price || 0) / nights, itemCurrency(i))} / noche` : ""
      }${
        i.paymentStatus === "Parcial" ? ` · ${primaryMoney(stayBudgetAmounts(i).paid, itemCurrency(i))} pagado` : ""
      }</span></div>${
        i.cancellationDeadline
          ? `<div class="stay-cancellation ${cancellationExpired ? "expired" : ""}">${icon("clock")} ${
            cancellationExpired ? "El plazo de cancelación terminó el" : "Cancelación gratuita hasta"
          } ${formatDate(i.cancellationDeadline)}</div>`
          : ""
      }<div class="stay-details"><span>Ref. <strong>${esc(i.reference || "—")}</strong></span>${
        i.contact ? `<span>Contacto: ${esc(i.contact)}</span>` : ""
      }<span>Maletas: ${esc((i.luggageStorage || "Por confirmar").toLocaleLowerCase("es"))}${
        i.luggageNotes ? ` · ${esc(i.luggageNotes)}` : ""
      }</span></div><div class="stay-actions">${
        i.link
          ? `<a class="btn btn-secondary" href="${esc(i.link)}" target="_blank" rel="noreferrer">${
            icon("external")
          } Abrir reserva</a>`
          : ""
      }${
        i.address || i.city
          ? `<a class="btn btn-secondary" href="${esc(mapsUrl)}" target="_blank" rel="noreferrer">${
            icon("map")
          } Cómo llegar</a>`
          : ""
      }${
        i.reference
          ? `<span class="stay-copy-reference">${copyReferenceButton("stays", i)} Copiar referencia</span>`
          : ""
      }<button class="btn btn-ghost icon-btn" data-edit="stays:${i.id}" aria-label="Editar alojamiento">${
        icon("edit")
      }</button></div></section>`;
    }).join("") || emptyState("Sin alojamiento", "Añade un hotel, apartamento u otro alojamiento.")
  }</div>`;
}
function renderTransport() {
  const items = filtered(store.collection("transports"), ["type", "operator", "origin", "destination"])
    .sort((a, b) =>
      `${a.departureDate || "9999"}${a.departureTime || ""}`.localeCompare(
        `${b.departureDate || "9999"}${b.departureTime || ""}`,
      )
    );
  return `${toolbar(["Todos", ...CATEGORIES.transport], addAction("transport", "Añadir transporte"))}${
    table(
      ["Trayecto", "Salida", "Llegada", "Duración", "Importe", "Pago", "Reserva", "Estado"],
      items.map((i) =>
        `<tr><td><span class="cell-main">${esc(i.origin)} ${icon("arrow")} ${
          esc(i.destination)
        }</span><span class="cell-sub">${esc(i.type)} · ${esc(i.operator || "—")}</span></td><td>${
          formatDate(i.departureDate)
        }<span class="cell-sub">${esc(i.departureTime)}</span></td><td>${
          formatDate(i.arrivalDate)
        }<span class="cell-sub">${esc(i.arrivalTime)}</span></td><td>${durationLabel(i.duration)}</td><td>${
          itemMoney(i.price, i)
        }</td><td>${badge(i.paymentStatus || (i.status === "Realizado" ? "Pagado" : "Pendiente"))}${
          Number(i.paidAmount || 0) > 0 && i.paymentStatus !== "Pagado"
            ? `<span class="cell-sub">${itemMoney(i.paidAmount, i)} pagado</span>`
            : ""
        }</td><td>${esc(i.reservation || "Sin referencia")}${
          copyReferenceButton("transports", i, "reservation")
        }<span class="cell-sub">${esc(i.seat || "")}</span>${
          i.link ? `<a class="cell-link" href="${esc(i.link)}" target="_blank" rel="noreferrer">Abrir reserva</a>` : ""
        }</td><td>${badge(i.status)}</td><td>${actions("transports", i.id)}</td></tr>`
      ),
      "No hay transportes",
    )
  }`;
}
function renderReservations() {
  const items = filtered(store.collection("reservations"), ["title", "type", "reference"])
    .sort((a, b) => `${a.date || "9999"}${a.time || ""}`.localeCompare(`${b.date || "9999"}${b.time || ""}`));
  return `${
    toolbar(
      ["Todos", "Hotel", "Restaurante", "Museo", "Actividad", "Transporte", "Entrada"],
      addAction("reservations", "Añadir reserva"),
    )
  }${
    table(
      ["Reserva", "Fecha y hora", "Referencia", "Importe", "Pago", "Estado", "Enlace"],
      items.map((i) =>
        `<tr><td><span class="cell-main">${esc(i.title)}</span><span class="cell-sub">${
          esc(visualLabel(i.type))
        }</span></td><td>${formatDate(i.date)} · ${esc(i.time || "—")}</td><td>${esc(i.reference || "—")}${
          copyReferenceButton("reservations", i)
        }</td><td>${itemMoney(i.price, i)}${
          Number(i.paidAmount || 0) > 0
            ? `<span class="cell-sub">Pagado ${primaryMoney(i.paidAmount, itemCurrency(i))}</span>`
            : ""
        }</td><td>${badge(i.paymentStatus)}</td><td>${badge(i.status)}</td><td>${
          i.link
            ? `<a class="btn btn-ghost" target="_blank" rel="noreferrer" href="${esc(i.link)}">${
              icon("external")
            } Abrir</a>`
            : "—"
        }</td><td>${actions("reservations", i.id)}</td></tr>`
      ),
      "No hay reservas",
    )
  }`;
}
function renderInspiration() {
  const enriched = store.collection("inspirations").map((item) => ({
    ...item,
    platform: inspirationLink(item.url)?.platform || "",
  }));
  const items = filtered(enriched, ["url", "platform", "category", "note"])
    .filter((item) =>
      ui.inspirationStatus === "Todos" ||
      (ui.inspirationStatus === "Vistos" ? Boolean(item.watched) : !item.watched)
    )
    .reverse();
  return `<div class="insight inspiration-help" style="margin-bottom:18px">${
    icon("play")
  }<div><strong>Guarda ideas desde tus redes</strong>En Android, instala Tabi y utiliza Compartir → Tabi para elegir el viaje. En iOS esta función automática no está disponible: copia el enlace y añádelo manualmente aquí.</div></div>${
    toolbar(
      ["Todos", "Lugares", "Comida", "Actividades", "Compras", "Alojamiento", "Transporte", "Consejos", "Otros"],
      `<div class="filter-control filter-control-secondary">${
        icon("filter")
      }<select data-inspiration-status aria-label="Filtrar por visualización"><option value="Todos" ${
        ui.inspirationStatus === "Todos" ? "selected" : ""
      }>${esc(visualLabel("Todos"))}</option><option value="No vistos" ${
        ui.inspirationStatus === "No vistos" ? "selected" : ""
      }>${esc(visualLabel("No vistos"))}</option><option value="Vistos" ${
        ui.inspirationStatus === "Vistos" ? "selected" : ""
      }>${esc(visualLabel("Vistos"))}</option></select></div>${addAction("inspiration", "Añadir inspiración")}`,
    )
  }<div class="grid grid-3 inspiration-grid">${
    items.map((item) => {
      const link = inspirationLink(item.url);
      if (!link) return "";
      return `<article class="card inspiration-card ${
        item.watched ? "watched" : ""
      }"><div class="inspiration-cover ${link.key}"><span>${icon("play")}</span><strong>${
        esc(link.platform)
      }</strong></div><div class="inspiration-body"><div>${`<span>${badge(link.platform)} ${
        badge(item.category || "Otros", "blue")
      }</span>`}${badge(item.watched ? "Visto" : "No visto", item.watched ? "green" : "amber")}</div><p>${
        esc(item.note || "Sin nota")
      }</p><small class="cell-sub inspiration-host">${
        esc(new URL(link.url).hostname.replace(/^www\./, ""))
      }</small><div class="place-meta inspiration-actions"><a class="btn btn-primary" href="${
        esc(link.url)
      }" target="_blank" rel="noreferrer">${icon("external")} Ver en ${esc(link.platform)}</a>${
        session.can(PERMISSIONS.TRIP_EDIT)
          ? `<button class="btn btn-secondary" type="button" data-toggle-inspiration="${item.id}">${
            icon(item.watched ? "close" : "check")
          } ${
            item.watched ? "Marcar no visto" : "Marcar visto"
          }</button><button class="btn btn-ghost icon-btn" data-edit="inspirations:${item.id}" aria-label="Editar enlace">${
            icon("edit")
          }</button><button class="btn btn-ghost icon-btn" type="button" data-delete-inspiration="${item.id}" aria-label="Eliminar inspiración">${
            icon("trash")
          }</button>`
          : ""
      }</div></div></article>`;
    }).join("") ||
    emptyState(
      "Aún no hay inspiración",
      "Guarda vídeos con ideas de lugares, comidas o planes para el viaje.",
      session.can(PERMISSIONS.TRIP_EDIT)
        ? `<button class="btn btn-primary" data-add="inspiration">${icon("plus")} Añadir enlace</button>`
        : "",
    )
  }</div>`;
}
function renderSettings() {
  const trip = store.activeTrip, s = store.getState().settings;
  const members = store.collection("members"), invitations = store.collection("invitations");
  const config = moneyConfig();
  const activeRate = config.rates[rateKey(config.primary, config.secondary)];
  const rateMeta = store.getState().exchangeRateMeta[rateKey(config.primary, config.secondary)] || {};
  const updatedAt = rateMeta.fetchedAt
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(rateMeta.fetchedAt))
    : "Sin actualización automática";
  return `<div class="section-stack">
    <div class="grid dashboard-grid"><div class="section-stack">
      <section class="card card-pad"><div class="card-head"><div><h2>Viaje activo</h2><p>Configuración compartida con el equipo</p></div>${
    session.can(PERMISSIONS.TRIP_EDIT)
      ? `<button class="btn btn-secondary" data-edit-trip>${icon("edit")} Editar</button>`
      : badge("Solo lectura", "blue")
  }</div><div class="grid grid-2"><div><span class="cell-sub">NOMBRE</span><strong>${trip.emoji} ${
    esc(trip.name)
  }</strong></div><div><span class="cell-sub">DESTINO</span><strong>${
    esc(trip.country)
  }</strong></div><div><span class="cell-sub">FECHAS</span><strong>${formatDate(trip.startDate)} — ${
    formatDate(trip.endDate)
  }</strong></div><div><span class="cell-sub">TU ROL</span><strong>${
    visualLabel(ROLE_LABELS[session.currentMembership.role])
  }</strong></div></div></section>
      <section class="card card-pad currency-settings"><div class="card-head"><div><h2>Monedas del viaje</h2><p>Configuración compartida con todos los miembros</p></div>${
    badge(
      trip.exchangeRateMode === "automatic" ? "Sincronizado" : "Manual",
      trip.exchangeRateMode === "automatic" ? "green" : "blue",
    )
  }</div><form id="currency-settings-form" class="form-grid"><div class="field"><label>Moneda principal</label><select name="currency" data-primary-currency ${
    session.can(PERMISSIONS.TRIP_EDIT) ? "" : "disabled"
  }>${
    MONEY_OPTIONS.map((option) =>
      `<option value="${option.value}" ${option.value === trip.currency ? "selected" : ""}>${
        esc(option.label)
      }</option>`
    ).join("")
  }</select></div><div class="field"><label>Moneda secundaria</label><select name="secondaryCurrency" data-secondary-currency ${
    session.can(PERMISSIONS.TRIP_EDIT) ? "" : "disabled"
  }>${
    MONEY_OPTIONS.map((option) =>
      `<option value="${option.value}" ${option.value === trip.secondaryCurrency ? "selected" : ""}>${
        esc(option.label)
      }</option>`
    ).join("")
  }</select></div><div class="field"><label>Tipo de cambio</label><select name="exchangeRateMode" data-rate-mode ${
    session.can(PERMISSIONS.TRIP_EDIT) ? "" : "disabled"
  }><option value="automatic" ${
    trip.exchangeRateMode === "automatic" ? "selected" : ""
  }>Automático (Internet)</option><option value="manual" ${
    trip.exchangeRateMode === "manual" ? "selected" : ""
  }>Manual</option></select></div><div class="field"><label data-manual-rate-label>1 ${esc(trip.currency)} equivale a ${
    esc(trip.secondaryCurrency)
  }</label><input name="manualExchangeRate" data-manual-rate type="number" min="0.00000001" step="any" value="${trip.manualExchangeRate}" ${
    trip.exchangeRateMode === "manual" && session.can(PERMISSIONS.TRIP_EDIT) ? "" : "disabled"
  }></div><div class="field full exchange-status"><strong>${
    activeRate
      ? `1 ${esc(config.primary)} = ${Number(activeRate).toLocaleString("es-ES", { maximumFractionDigits: 8 })} ${
        esc(config.secondary)
      }`
      : "Cambio no disponible"
  }</strong><span>${
    esc(rateMeta.warning || rateMeta.error || `${rateMeta.provider || "manual"} · ${updatedAt}`)
  }</span></div>${
    session.can(PERMISSIONS.TRIP_EDIT)
      ? `<div class="field full currency-actions"><button class="btn btn-primary" type="submit">Guardar monedas</button><button class="btn btn-secondary" type="button" data-refresh-rate ${
        trip.exchangeRateMode === "automatic" ? "" : "disabled"
      }>${icon("sync")} Actualizar ahora</button></div>`
      : ""
  }</form></section>
      <section class="card card-pad project-transfer"><div class="card-head"><div><h2>Exportar e importar proyecto</h2><p>Copia completa editable en formato JSON</p></div><span class="stat-icon amber">${
    icon("download")
  }</span></div><p class="cell-sub">Incluye la configuración del viaje y todas sus actividades, lugares, tareas, notas, presupuesto, fondos, alojamientos, transportes, reservas e inspiración. No incluye cuentas, miembros, invitaciones ni contraseñas.</p><div class="project-transfer-actions"><button class="btn btn-secondary" type="button" data-export-project>${
    icon("download")
  } Exportar para ChatGPT</button>${
    session.can(PERMISSIONS.TRIP_EDIT)
      ? `<button class="btn btn-primary" type="button" data-import-project>${
        icon("upload")
      } Importar cambios</button><input type="file" accept="application/json,.json" data-project-file hidden>`
      : ""
  }</div><span class="field-help">Al importar, el contenido del viaje se sustituye por el del archivo; los miembros y permisos se conservan.</span></section>
      <section class="card card-pad"><div class="card-head"><div><h2>Miembros</h2><p>${members.length} personas participan en este viaje</p></div>${
    session.can(PERMISSIONS.MEMBER_INVITE)
      ? `<button class="btn btn-primary" data-new-invite>${icon("plus")} Crear enlace</button>`
      : ""
  }</div><div class="member-list">${members.map(memberRow).join("")}</div></section>
      ${
    session.can(PERMISSIONS.MEMBER_INVITE)
      ? `<section class="card card-pad"><div class="card-head"><div><h2>Invitaciones</h2><p>Enlaces activos y anteriores</p></div></div><div class="item-list">${
        invitations.map(invitationRow).join("") || `<p class="cell-sub">Aún no has creado invitaciones.</p>`
      }</div></section>`
      : ""
  }
    </div><aside class="section-stack">
      <section class="card card-pad"><div class="card-head"><div><h2>Preferencias</h2><p>Solo afectan a este dispositivo</p></div></div><form id="settings-form" class="form-grid"><div class="field full"><label>Tema</label><select name="theme"><option value="system" ${
    s.theme === "system" ? "selected" : ""
  }>${visualLabel("Sistema")}</option><option value="light" ${s.theme === "light" ? "selected" : ""}>${
    visualLabel("Claro")
  }</option><option value="dark" ${s.theme === "dark" ? "selected" : ""}>${
    visualLabel("Oscuro")
  }</option></select></div><div class="field"><label>Inicio</label><input type="time" name="dayStart" value="${s.dayStart}"></div><div class="field"><label>Fin</label><input type="time" name="dayEnd" value="${s.dayEnd}"></div><div class="field full"><button class="btn btn-primary" type="submit">Guardar</button></div></form></section>
      <section class="card card-pad"><div class="card-head"><div><h2>Tu cuenta</h2><p>${
    esc(session.currentUser.email)
  }</p></div>${
    avatar(session.currentUser)
  }</div><div class="section-stack"><button class="btn btn-secondary" data-password>Cambiar contraseña</button><button class="btn btn-secondary" data-trip-list>Volver a mis viajes</button><button class="btn btn-danger" data-logout>Cerrar sesión</button></div></section>${
    session.can(PERMISSIONS.TRIP_DELETE)
      ? `<button class="btn btn-danger" data-delete-trip>Eliminar viaje definitivamente</button>`
      : ""
  }
    </aside></div>
  </div>`;
}

function memberRow(member) {
  const isSelf = member.user.id === session.currentUser.id;
  const manageable = session.can(PERMISSIONS.MEMBER_CHANGE_ROLE) && member.role !== "owner" && !isSelf;
  return `<div class="member-row">${avatar(member.user)}<div class="list-item-main"><strong>${esc(member.user.name)}${
    isSelf ? " · Tú" : ""
  }</strong><small>${esc(member.user.email)} · desde ${formatDate(member.joinedAt)}</small></div>${
    manageable
      ? `<select data-member-role="${member.user.id}" style="width:135px"><option value="editor" ${
        member.role === "editor" ? "selected" : ""
      }>${visualLabel("Editor")}</option><option value="viewer" ${member.role === "viewer" ? "selected" : ""}>${
        visualLabel("Lector")
      }</option></select><button class="btn btn-ghost icon-btn" data-transfer-owner="${member.user.id}" aria-label="Transferir propiedad" title="Transferir propiedad">${
        icon("users")
      }</button><button class="btn btn-ghost icon-btn" data-remove-member="${member.user.id}" aria-label="Expulsar">${
        icon("trash")
      }</button>`
      : badge(ROLE_LABELS[member.role], member.role === "owner" ? "red" : "blue")
  }</div>`;
}

function invitationRow(invitation) {
  const savedToken = savedInvitationTokens()[invitation.id];
  return `<div class="list-item"><span class="stat-icon ${invitation.status === "active" ? "" : "amber"}">${
    icon("ticket")
  }</span><div class="list-item-main"><strong>${
    visualLabel(ROLE_LABELS[invitation.role])
  } · ${invitation.uses}/${invitation.maxUses} usos</strong><small>Creada por ${esc(invitation.creatorName)} · vence ${
    formatDate(invitation.expiresAt.slice(0, 10))
  }</small></div>${
    badge(({ active: "Activa", revoked: "Revocada", expired: "Expirada", used: "Consumida" })[invitation.status])
  }${
    invitation.status === "active" && savedToken
      ? `<button class="btn btn-ghost icon-btn" data-copy-invite="${invitation.id}" aria-label="Copiar enlace">${
        icon("file")
      }</button>`
      : ""
  }${
    invitation.status === "active"
      ? `<button class="btn btn-ghost icon-btn" data-revoke-invite="${invitation.id}" aria-label="Revocar">${
        icon("trash")
      }</button>`
      : ""
  }</div>`;
}

function savedInvitationTokens() {
  try {
    return JSON.parse(localStorage.getItem("tabi-invitation-tokens") || "{}");
  } catch {
    return {};
  }
}
function saveInvitationToken(id, token) {
  const tokens = savedInvitationTokens();
  tokens[id] = token;
  localStorage.setItem("tabi-invitation-tokens", JSON.stringify(tokens));
}
function renderMore() {
  return `<div class="grid grid-2">${
    NAV.filter(([r]) => !["dashboard", "itinerary", "map", "budget"].includes(r)).map(([r, l, i]) =>
      `<button class="card card-pad" style="border:1px solid var(--line);text-align:left;color:inherit;cursor:pointer" data-route="${r}"><span class="stat-icon red">${
        icon(i)
      }</span><h3 style="margin:14px 0 4px">${l}</h3><span class="cell-sub">${DESCRIPTIONS[r]}</span></button>`
    ).join("")
  }</div>`;
}

function openEditor(collection, idValue) {
  const required = collection === "expenses" || collection === "funds"
    ? PERMISSIONS.BUDGET_EDIT
    : PERMISSIONS.TRIP_EDIT;
  if (!session.can(required)) {
    toast("Tu rol permite consultar, pero no modificar este viaje.", "error");
    return;
  }
  const config = {
    activities: ["activity", "Actividad"],
    places: ["place", "Lugar"],
    tasks: ["task", "Tarea"],
    purchases: ["purchase", "Compra"],
    expenses: ["expense", "Gasto"],
    notes: ["note", "Nota"],
    funds: ["fund", "Aportación"],
    stays: ["stay", "Alojamiento"],
    transports: ["transport", "Transporte"],
    reservations: ["reservation", "Reserva"],
    inspirations: ["inspiration", "Inspiración"],
  }[collection];
  if (!config) return;
  const item = idValue ? store.collection(collection).find((i) => i.id === idValue) : null;
  const [type, label] = config;
  const defaults = {
    activity: { activityKind: "General", date: activeDate(), start: "09:00", end: "10:00", status: "planned" },
    place: {
      status: "Pendiente",
      priority: "Media",
      duration: 60,
      markerIcon: "📍",
      admission: "No necesita entrada",
      currency: store.activeTrip.currency,
    },
    task: { priority: "Media", status: "Pendiente", assigneeId: session.currentUser.id },
    purchase: { status: "Pendiente", priority: "Media", actualPrice: 0, currency: store.activeTrip.currency },
    note: { order: Math.max(0, ...store.collection("notes").map((note) => Number(note.order || 0))) + 1 },
    expense: {
      date: todayIso(),
      currency: store.activeTrip.currency,
      paymentStatus: "Pendiente",
      paidByUserId: session.currentUser.id,
    },
    fund: {
      title: "Aportación",
      contributor: session.currentUser.name,
      date: todayIso(),
      currency: store.activeTrip.currency,
    },
    stay: {
      checkInDate: activeDate(),
      checkOutDate: addDaysIso(activeDate(), 1),
      checkInTime: "15:00",
      checkOutTime: "11:00",
      platform: "Otros",
      bookingStatus: "Pendiente",
      paymentStatus: "Pendiente",
      luggageStorage: "Por confirmar",
      currency: store.activeTrip.currency,
    },
    transport: {
      departureDate: activeDate(),
      arrivalDate: activeDate(),
      status: "Por reservar",
      paymentStatus: "Pendiente",
      currency: store.activeTrip.currency,
    },
    reservation: {
      date: activeDate(),
      status: "Pendiente",
      paymentStatus: "Pendiente",
      currency: store.activeTrip.currency,
    },
    inspiration: {},
  }[type] || {};
  const editorValues = item && type === "activity" && !item.activityKind
    ? { ...item, activityKind: activityKindOf(item) }
    : item || defaults;
  modal({
    title: item ? `Editar ${label.toLowerCase()}` : `Nuevo ${label.toLowerCase()}`,
    fields: resolvedFields(type, editorValues),
    values: editorValues,
    dangerLabel: item ? "Eliminar" : "",
    onSubmit: async (values) => {
      if (type === "purchase" && Number(values.actualPrice || 0) > 0) {
        values.status = "Comprado";
        values.purchaseDate ||= todayIso();
      }
      const requiredLink = { Lugar: "placeId", Hospedaje: "stayId", Transporte: "transportId" }[values.activityKind];
      if (type === "activity" && requiredLink && !values[requiredLink]) {
        throw new Error(
          `Selecciona ${
            values.activityKind === "Lugar"
              ? "un lugar"
              : values.activityKind === "Hospedaje"
              ? "un hospedaje"
              : "un transporte"
          } guardado.`,
        );
      }
      if (type === "activity" && values.end <= values.start) {
        throw new Error("La hora final debe ser posterior a la inicial.");
      }
      if (
        type === "stay" &&
        (values.checkOutDate < values.checkInDate ||
          (values.checkOutDate === values.checkInDate && values.checkInTime && values.checkOutTime &&
            values.checkOutTime <= values.checkInTime))
      ) {
        throw new Error("La salida del alojamiento debe ser posterior a la entrada.");
      }
      if (type === "stay" && values.cancellationDeadline && values.cancellationDeadline > values.checkInDate) {
        throw new Error("La fecha límite de cancelación no puede ser posterior a la entrada.");
      }
      if (type === "stay") {
        const total = Number(values.price || 0);
        const paid = Number(values.paidAmount || 0);
        if (paid > total) throw new Error("El importe pagado no puede superar el precio total del alojamiento.");
        if (values.paymentStatus === "Pagado") values.paidAmount = total;
        else if (paid > 0) values.paymentStatus = paid >= total && total > 0 ? "Pagado" : "Parcial";
        else if (values.paymentStatus !== "Pagado") values.paymentStatus = "Pendiente";
      }
      if (
        type === "transport" && values.arrivalDate &&
        (`${values.arrivalDate}T${values.arrivalTime || "23:59"}` <
          `${values.departureDate}T${values.departureTime || "00:00"}`)
      ) {
        throw new Error("La llegada del transporte no puede ser anterior a la salida.");
      }
      if (type === "transport") {
        const total = Number(values.price || 0);
        const paid = Number(values.paidAmount || 0);
        if (paid > total) throw new Error("El importe pagado no puede superar el precio total del transporte.");
        if (values.paymentStatus === "Pagado") values.paidAmount = total;
        else if (paid > 0) values.paymentStatus = paid >= total && total > 0 ? "Pagado" : "Parcial";
        else values.paymentStatus = "Pendiente";
      }
      if (type === "note" && !item) values.order = defaults.order;
      try {
        item ? await store.edit(collection, item.id, values) : await store.add(collection, values);
      } catch (error) {
        if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
          document.querySelector("#modal-root").innerHTML = "";
          await refreshAfterConflict();
        }
        throw error;
      }
      toast(item ? "Cambios guardados" : "Elemento añadido");
      render();
    },
    onReady: type === "place"
      ? (root) => initializePlaceEditor(root, item)
      : type === "activity"
      ? initializeActivityLinks
      : type === "stay"
      ? initializeStayFields
      : type === "purchase"
      ? initializePurchaseFields
      : type === "transport"
      ? initializeTransportFields
      : undefined,
    onDanger: item
      ? async () => {
        await store.remove(collection, item.id);
        toast("Elemento eliminado");
        render();
      }
      : null,
  });
}

function bindCommon() {
  initializeImageLightbox(app);
  app.querySelectorAll(".place-cover-photo").forEach((image) =>
    image.addEventListener("error", () => {
      const cover = image.closest(".place-cover");
      cover?.classList.remove("has-photo");
      cover?.querySelector(".place-photo-credit")?.remove();
      image.remove();
    })
  );
  app.querySelector("[data-complete-place-photos]")?.addEventListener(
    "click",
    (event) => completePlacePhotos(event.currentTarget),
  );
  app.querySelectorAll("[data-route]").forEach((button) =>
    button.addEventListener("click", () => {
      const route = button.dataset.route;
      if (location.hash.slice(1) !== route) history.pushState({}, "", `#${route}`);
      ui.route = route;
      ui.query = "";
      ui.filter = "Todos";
      ui.inspirationStatus = "Todos";
      ui.mapSidebarOpen = false;
      render();
    })
  );
  app.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;
    store.update((s) => s.settings.theme = current === "dark" ? "light" : "dark");
    render();
  });
  app.querySelectorAll("[data-search]").forEach((input) =>
    input.addEventListener("input", () => {
      ui.query = input.value;
      render();
      requestAnimationFrame(() => {
        const el = app.querySelector("[data-search]");
        el?.focus();
        el?.setSelectionRange(ui.query.length, ui.query.length);
      });
    })
  );
  app.querySelector("[data-filter]")?.addEventListener("change", (event) => {
    ui.filter = event.target.value;
    render();
  });
  app.querySelector("[data-inspiration-status]")?.addEventListener("change", (event) => {
    ui.inspirationStatus = event.target.value;
    render();
  });
  app.querySelectorAll("[data-edit]").forEach((button) =>
    button.addEventListener("click", () => {
      const [collection, id] = button.dataset.edit.split(":");
      openEditor(collection, id);
    })
  );
  app.querySelectorAll("[data-add]").forEach((button) =>
    button.addEventListener("click", () => {
      const map = {
        itinerary: "activities",
        places: "places",
        purchases: "purchases",
        tasks: "tasks",
        notes: "notes",
        budget: "expenses",
        stays: "stays",
        transport: "transports",
        reservations: "reservations",
        inspiration: "inspirations",
      };
      openEditor(map[button.dataset.add]);
    })
  );
  app.querySelectorAll("[data-trip-list]").forEach((button) =>
    button.addEventListener("click", async () => {
      store.closeEvents();
      session.clearTrip();
      history.replaceState({}, "", "/");
      await session.loadTrips();
      renderTripsDashboard();
    })
  );
}

function bindRoute() {
  app.querySelectorAll("[data-go-date]").forEach((button) =>
    button.addEventListener("click", () => {
      ui.selectedDate = button.dataset.goDate;
      ui.itineraryView = "day";
      location.hash = "itinerary";
    })
  );
  app.querySelectorAll("[data-date]").forEach((button) =>
    button.addEventListener("click", () => {
      ui.selectedDate = button.dataset.date;
      render();
    })
  );
  const dayStrip = app.querySelector(".day-strip");
  const activeDay = dayStrip?.querySelector(".day-button.active");
  if (dayStrip && activeDay) {
    requestAnimationFrame(() => activeDay.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
    dayStrip.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const maxScroll = dayStrip.scrollWidth - dayStrip.clientWidth;
      const canMove = (event.deltaY < 0 && dayStrip.scrollLeft > 0) ||
        (event.deltaY > 0 && dayStrip.scrollLeft < maxScroll);
      if (!canMove) return;
      event.preventDefault();
      dayStrip.scrollLeft += event.deltaY;
    }, { passive: false });
    let dragging = false;
    let dragged = false;
    let startX = 0;
    let startScroll = 0;
    dayStrip.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      dragging = true;
      dragged = false;
      startX = event.clientX;
      startScroll = dayStrip.scrollLeft;
      dayStrip.classList.add("dragging");
      dayStrip.setPointerCapture(event.pointerId);
    });
    dayStrip.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      if (Math.abs(event.clientX - startX) > 5) dragged = true;
      dayStrip.scrollLeft = startScroll - (event.clientX - startX);
    });
    const stopDragging = () => {
      dragging = false;
      dayStrip.classList.remove("dragging");
    };
    dayStrip.addEventListener("pointerup", stopDragging);
    dayStrip.addEventListener("pointercancel", stopDragging);
    dayStrip.addEventListener("click", (event) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
    }, true);
  }
  app.querySelectorAll("[data-itinerary-view]").forEach((button) =>
    button.addEventListener("click", () => {
      ui.itineraryView = button.dataset.itineraryView;
      render();
    })
  );
  app.querySelectorAll("[data-edit-activity]").forEach((card) =>
    card.addEventListener("click", () => {
      if (!card.dataset.editActivity.startsWith("virtual")) openEditor("activities", card.dataset.editActivity);
    })
  );
  app.querySelectorAll("[data-activity-maps]").forEach((link) =>
    link.addEventListener("click", (event) => event.stopPropagation())
  );
  app.querySelectorAll("[data-toggle-inspiration]").forEach((button) =>
    button.addEventListener("click", async () => {
      const item = store.collection("inspirations").find(({ id }) => id === button.dataset.toggleInspiration);
      if (!item) return;
      button.disabled = true;
      try {
        await store.edit("inspirations", item.id, { watched: !item.watched });
        toast(item.watched ? "Marcado como no visto" : "Marcado como visto");
        render();
      } catch (error) {
        await refreshAfterConflict();
        toast(error.message || "No se ha podido cambiar el estado.", "error");
      }
    })
  );
  app.querySelectorAll("[data-delete-inspiration]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este enlace de Inspiración?")) return;
      button.disabled = true;
      try {
        await store.remove("inspirations", button.dataset.deleteInspiration);
        toast("Inspiración eliminada");
        render();
      } catch (error) {
        button.disabled = false;
        toast(error.message || "No se ha podido eliminar.", "error");
      }
    })
  );
  app.querySelectorAll("[data-map-place]").forEach((button) =>
    button.addEventListener("click", () => {
      ui.mapPlaceId = button.dataset.mapPlace;
      ui.mapSidebarOpen = false;
      render();
    })
  );
  app.querySelector("[data-map-panel-toggle]")?.addEventListener("click", () => setMapSidebarOpen(true));
  app.querySelectorAll("[data-map-panel-close]").forEach((button) =>
    button.addEventListener("click", () => setMapSidebarOpen(false))
  );
  app.querySelectorAll("[data-toggle-task]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (!session.can(PERMISSIONS.TRIP_EDIT)) return toast("No tienes permiso para modificar tareas.", "error");
      const task = store.collection("tasks").find((i) => i.id === button.dataset.toggleTask);
      try {
        await store.edit("tasks", task.id, { status: task.status === "Completada" ? "Pendiente" : "Completada" });
        render();
      } catch (error) {
        toast(error.message, "error");
      }
    })
  );
  app.querySelectorAll("[data-copy-reference]").forEach((button) =>
    button.addEventListener("click", async () => {
      const [collection, id, field] = button.dataset.copyReference.split(":");
      const item = store.collection(collection).find((candidate) => candidate.id === id);
      if (!item?.[field]) return;
      try {
        await navigator.clipboard.writeText(item[field]);
        toast("Referencia copiada");
      } catch {
        toast("No se ha podido copiar la referencia.", "error");
      }
    })
  );
  app.querySelectorAll("[data-note-move]").forEach((button) =>
    button.addEventListener("click", () => moveNote(button.dataset.noteMove))
  );
  bindDrag();
  app.querySelector("[data-add-fund]")?.addEventListener("click", () => openEditor("funds"));
  if (ui.route === "map") {
    initializeGoogleMap().catch((error) => {
      console.error(error);
      const canvas = document.querySelector("#google-map");
      if (canvas) {
        canvas.innerHTML = `<div class="map-message">${icon("alert")}<h3>No se pudo cargar Google Maps</h3><p>${
          esc(error.message || "Revisa la clave y las APIs habilitadas.")
        }</p></div>`;
      }
    });
  }
  app.querySelector("#settings-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    store.update((s) => Object.assign(s.settings, values));
    toast("Preferencias guardadas");
    render();
  });
  const rateMode = app.querySelector("[data-rate-mode]");
  const manualRate = app.querySelector("[data-manual-rate]");
  const primaryCurrency = app.querySelector("[data-primary-currency]");
  const secondaryCurrency = app.querySelector("[data-secondary-currency]");
  const manualRateLabel = app.querySelector("[data-manual-rate-label]");
  const canEditCurrencies = session.can(PERMISSIONS.TRIP_EDIT);
  const initialCurrencyPair = `${primaryCurrency?.value}:${secondaryCurrency?.value}`;
  const updateCurrencyFields = () => {
    if (manualRate) {
      const isManual = rateMode?.value === "manual";
      manualRate.disabled = !isManual || !canEditCurrencies;
      manualRate.required = Boolean(isManual && canEditCurrencies);
    }
    if (manualRateLabel && primaryCurrency && secondaryCurrency) {
      manualRateLabel.textContent = `1 ${primaryCurrency.value} equivale a ${secondaryCurrency.value}`;
    }
  };
  rateMode?.addEventListener("change", () => {
    updateCurrencyFields();
  });
  [primaryCurrency, secondaryCurrency].forEach((select) =>
    select?.addEventListener("change", () => {
      if (manualRate && rateMode?.value === "manual") {
        const currentPair = `${primaryCurrency.value}:${secondaryCurrency.value}`;
        if (currentPair !== initialCurrencyPair) manualRate.value = "";
      }
      updateCurrencyFields();
    })
  );
  updateCurrencyFields();
  app.querySelector("#currency-settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.currency === values.secondaryCurrency) {
      return toast("La moneda principal y la secundaria deben ser diferentes.", "error");
    }
    const suppliedManualRate = Number(values.manualExchangeRate);
    if (values.exchangeRateMode === "manual" && (!Number.isFinite(suppliedManualRate) || suppliedManualRate <= 0)) {
      return toast("Introduce un tipo de cambio manual válido para las monedas seleccionadas.", "error");
    }
    try {
      await apiClient.patch(`/trips/${store.activeTrip.id}`, {
        ...values,
        manualExchangeRate: values.exchangeRateMode === "manual"
          ? suppliedManualRate
          : Number(store.activeTrip.manualExchangeRate),
        version: store.activeTrip.version,
      });
      const payload = await store.loadTrip(store.activeTrip.id, handleRemoteChange);
      session.selectTrip(payload);
      toast("Configuración monetaria actualizada");
      render();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  app.querySelector("[data-refresh-rate]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await store.refreshExchangeRates(true);
      toast("Tipo de cambio actualizado");
      render();
    } catch (error) {
      event.currentTarget.disabled = false;
      toast(error.message, "error");
    }
  });
  app.querySelector("[data-edit-trip]")?.addEventListener("click", editTrip);
  app.querySelector("[data-export-project]")?.addEventListener("click", exportProject);
  app.querySelector("[data-import-project]")?.addEventListener(
    "click",
    () => app.querySelector("[data-project-file]")?.click(),
  );
  app.querySelector("[data-project-file]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) await importProject(file);
  });
  app.querySelectorAll("[data-new-invite]").forEach((button) => button.addEventListener("click", createInvitation));
  app.querySelectorAll("[data-member-role]").forEach((select) =>
    select.addEventListener("change", () => changeMemberRole(select.dataset.memberRole, select.value))
  );
  app.querySelectorAll("[data-remove-member]").forEach((button) =>
    button.addEventListener("click", () => removeMember(button.dataset.removeMember))
  );
  app.querySelectorAll("[data-transfer-owner]").forEach((button) =>
    button.addEventListener("click", () => transferOwner(button.dataset.transferOwner))
  );
  app.querySelectorAll("[data-revoke-invite]").forEach((button) =>
    button.addEventListener("click", () => revokeInvitation(button.dataset.revokeInvite))
  );
  app.querySelectorAll("[data-copy-invite]").forEach((button) =>
    button.addEventListener("click", () => copyInvitation(button.dataset.copyInvite))
  );
  app.querySelector("[data-password]")?.addEventListener("click", changePasswordDialog);
  app.querySelector("[data-delete-trip]")?.addEventListener("click", deleteTrip);
  app.querySelector("[data-logout]")?.addEventListener("click", performLogout);
}

async function moveNote(value) {
  const [id, direction] = value.split(":");
  const notes = orderedNotes();
  const index = notes.findIndex((note) => note.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= notes.length) return;
  const target = notes[targetIndex];
  let order;
  if (direction === "up") {
    const before = notes[targetIndex - 1];
    order = before
      ? (Number(before.order || targetIndex - 1) + Number(target.order || targetIndex)) / 2
      : Number(target.order || targetIndex) - 1;
  } else {
    const after = notes[targetIndex + 1];
    order = after
      ? (Number(target.order || targetIndex) + Number(after.order || targetIndex + 1)) / 2
      : Number(target.order || targetIndex) + 1;
  }
  try {
    await store.edit("notes", id, { order });
    render();
  } catch (error) {
    toast(error.message || "No se ha podido mover la nota.", "error");
  }
}

function bindDrag() {
  if (!session.can(PERMISSIONS.TRIP_EDIT)) return;
  let dragged = "";
  app.querySelectorAll("[data-drag-id]").forEach((card) => {
    card.addEventListener("dragstart", () => {
      dragged = card.dataset.dragId;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      const target = card.dataset.dragId;
      if (!dragged || target === dragged) return;
      const all = store.collection("activities"),
        a = all.find((i) => i.id === dragged),
        b = all.find((i) => i.id === target);
      if (a && b) {
        const times = { start: a.start, end: a.end };
        try {
          await store.edit("activities", a.id, { start: b.start, end: b.end });
          await store.edit("activities", b.id, times);
          toast("Orden actualizado");
          render();
        } catch (error) {
          await refreshAfterConflict();
          toast(error.message, "error");
        }
      }
    });
  });
}
function editTrip() {
  const trip = store.activeTrip;
  modal({
    title: "Editar viaje",
    fields: [
      { name: "name", label: "Nombre", required: true },
      { name: "emoji", label: "Emoji", type: "select", options: TRIP_EMOJIS },
      {
        name: "country",
        label: "País",
        type: "autocomplete",
        required: true,
        placeholder: "Escribe para buscar un país",
        options: countryOptions(),
      },
      { name: "startDate", label: "Inicio", type: "date", required: true },
      { name: "endDate", label: "Fin", type: "date", required: true },
      { name: "travelers", label: "Viajeros", type: "number", min: 1 },
      { name: "budget", label: `Presupuesto original (${trip.budgetCurrency})`, type: "number", min: 0 },
    ],
    values: trip,
    onSubmit: async (values) => {
      await apiClient.patch(`/trips/${trip.id}`, { ...values, version: trip.version });
      const payload = await store.loadTrip(trip.id, handleRemoteChange);
      session.selectTrip(payload);
      ui.selectedDate = "";
      toast("Viaje actualizado");
      render();
    },
  });
}

async function refreshAfterConflict() {
  const payload = await store.loadTrip(store.activeTrip.id, handleRemoteChange);
  session.selectTrip(payload);
  render();
}

async function exportProject(event) {
  const button = event?.currentTarget;
  if (button) button.disabled = true;
  try {
    const archive = await apiClient.get(`/trips/${store.activeTrip.id}/archive`);
    const filename = `${
      store.activeTrip.name.normalize("NFKD").replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "viaje"
    }.tabi-trip.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Proyecto completo exportado");
  } catch (error) {
    toast(error.message || "No se ha podido exportar el proyecto.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function importProject(file) {
  if (file.size > 10_000_000) return toast("El proyecto supera el límite de 10 MB.", "error");
  let archive;
  try {
    archive = JSON.parse(await file.text());
  } catch {
    return toast("El archivo no contiene un JSON válido.", "error");
  }
  if (archive?.format !== "tabi-trip" || archive?.schemaVersion !== 1 || !archive.collections) {
    return toast("Selecciona un proyecto Tabi compatible.", "error");
  }
  const entityCount = Object.values(archive.collections).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0,
  );
  const accepted = confirm(
    `Vas a importar “${archive.trip?.name || "Proyecto sin nombre"}” con ${entityCount} elementos.\n\n` +
      `Se sustituirá el contenido actual de “${store.activeTrip.name}”. Los miembros y permisos no cambiarán. ¿Continuar?`,
  );
  if (!accepted) return;
  try {
    ui.busy = true;
    const result = await apiClient.post(`/trips/${store.activeTrip.id}/archive`, { archive });
    const payload = await store.loadTrip(store.activeTrip.id, handleRemoteChange);
    session.selectTrip(payload);
    ui.selectedDate = "";
    toast(
      result.warnings?.length
        ? `${result.imported} elementos importados · ${result.warnings.length} vínculos pendientes`
        : `${result.imported} elementos importados`,
    );
    render();
  } catch (error) {
    toast(error.message || "No se ha podido importar el proyecto.", "error");
  } finally {
    ui.busy = false;
  }
}

function createInvitation() {
  modal({
    title: "Crear enlace de invitación",
    fields: [
      {
        name: "role",
        label: "Rol",
        type: "select",
        options: [{ value: "editor", label: "Editor · puede modificar" }, {
          value: "viewer",
          label: "Viewer · solo lectura",
        }],
      },
      { name: "expiryDays", label: "Caduca en días", type: "number", min: 1, value: 7 },
      { name: "maxUses", label: "Número máximo de usos", type: "number", min: 1, value: 1 },
    ],
    submitLabel: "Crear y copiar enlace",
    onSubmit: async (values) => {
      const { invitation } = await apiClient.post(`/trips/${store.activeTrip.id}/invitations`, values);
      saveInvitationToken(invitation.id, invitation.token);
      await navigator.clipboard?.writeText(`${location.origin}/invite/${invitation.token}`).catch(() => {});
      const payload = await store.loadTrip(store.activeTrip.id, handleRemoteChange);
      session.selectTrip(payload);
      toast("Enlace creado y copiado");
      render();
    },
  });
}

async function changeMemberRole(userId, role) {
  try {
    const { members } = await apiClient.patch(`/trips/${store.activeTrip.id}/members/${userId}`, { role });
    store.getState().members = members;
    toast("Permisos actualizados");
    render();
  } catch (error) {
    toast(error.message, "error");
    await refreshAfterConflict();
  }
}

async function removeMember(userId) {
  if (!confirm("¿Expulsar a este miembro del viaje?")) return;
  try {
    await apiClient.delete(`/trips/${store.activeTrip.id}/members/${userId}`);
    await refreshAfterConflict();
    toast("Miembro eliminado");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function transferOwner(userId) {
  if (!confirm("¿Transferir la propiedad? Pasarás a tener rol Editor.")) return;
  try {
    await apiClient.post(`/trips/${store.activeTrip.id}/transfer`, { userId });
    await refreshAfterConflict();
    toast("Propiedad transferida");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function revokeInvitation(id) {
  if (!confirm("¿Revocar este enlace de invitación?")) return;
  try {
    await apiClient.delete(`/trips/${store.activeTrip.id}/invitations/${id}`);
    await refreshAfterConflict();
    toast("Invitación revocada");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function copyInvitation(id) {
  const token = savedInvitationTokens()[id];
  if (!token) return toast("El token solo está disponible en el dispositivo donde se creó.", "error");
  await navigator.clipboard.writeText(`${location.origin}/invite/${token}`);
  toast("Enlace copiado");
}

function changePasswordDialog() {
  modal({
    title: "Cambiar contraseña",
    fields: [{ name: "currentPassword", label: "Contraseña actual", type: "password", required: true, full: true }, {
      name: "newPassword",
      label: "Nueva contraseña",
      type: "password",
      required: true,
      full: true,
      help: "Mínimo 6 caracteres.",
    }],
    submitLabel: "Actualizar contraseña",
    onSubmit: async (values) => {
      await apiClient.patch("/auth/password", values);
      toast("Contraseña actualizada. Las otras sesiones se han cerrado.");
    },
  });
}

async function importLegacy() {
  const legacy = store.legacyData();
  if (!legacy) return;
  const result = await apiClient.post(`/trips/${store.activeTrip.id}/import`, legacy);
  store.clearLegacyData();
  await refreshAfterConflict();
  toast(`${result.imported} elementos importados`);
}

async function deleteTrip() {
  if (!confirm(`¿Eliminar “${store.activeTrip.name}” y todos sus datos? Esta acción no se puede deshacer.`)) return;
  try {
    await apiClient.delete(`/trips/${store.activeTrip.id}`);
    store.closeEvents();
    session.clearTrip();
    await session.loadTrips();
    history.replaceState({}, "", "/");
    toast("Viaje eliminado");
    renderTripsDashboard();
  } catch (error) {
    toast(error.message, "error");
  }
}

globalThis.addEventListener("hashchange", () => {
  ui.route = location.hash.slice(1) || "dashboard";
  ui.query = "";
  ui.filter = "Todos";
  ui.inspirationStatus = "Todos";
  ui.mapSidebarOpen = false;
  if (session.currentTrip) render();
});
store.subscribe(() => applyTheme());
applyTheme();
await start();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update())
    .catch(() => {});
}

async function start() {
  renderLoading();
  await Promise.all([session.restore(), loadVersion()]);
  if (inviteTokenFromPath()) return renderInvitation();
  if (shareTargetFromPath()) return renderShareTarget();
  if (!session.currentUser) return renderAuth();
  renderTripsDashboard();
}

async function loadVersion() {
  try {
    ui.commitSha = (await apiClient.get("/version")).commit || "";
  } catch {
    ui.commitSha = "";
  }
}
