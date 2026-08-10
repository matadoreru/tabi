import { CATEGORIES } from "./data.js";
import { countryOptions, TRIP_EMOJIS } from "./countries.js";
import {
  activityGoogleMapsUrl,
  budgetSummary,
  dateRange,
  durationLabel,
  fundContributorOptions,
  googleMapsLinkSearch,
  groupTotals,
  inspirationLink,
  itineraryAnalysis,
  sharedInspirationLink,
} from "./domain.js";
import { Store } from "./store.js";
import { badge, emptyState, esc, formatDate, formatMoney, fullDate, icon, modal, toast } from "./ui.js";
import { apiClient, ApiError } from "./api-client.js";
import { session } from "./session.js";
import { PERMISSIONS, ROLE_LABELS } from "./permissions.js";

const store = new Store();
const app = document.querySelector("#app");
const ui = {
  route: location.hash.slice(1) || "dashboard",
  query: "",
  selectedDate: "",
  itineraryView: "day",
  mapPlaceId: "",
  filter: "Todos",
  authMode: "login",
  busy: false,
};

const NAV = [
  ["dashboard", "Dashboard", "dashboard"],
  ["itinerary", "Itinerario", "calendar"],
  ["map", "Mapa", "map"],
  ["places", "Lugares", "pin"],
  ["purchases", "Compras", "bag"],
  ["tasks", "TODO", "check"],
  ["budget", "Presupuesto", "wallet"],
  ["stays", "Hospedaje", "bed"],
  ["transport", "Transporte", "train"],
  ["reservations", "Reservas", "ticket"],
  ["inspiration", "Inspiración", "play"],
  ["documents", "Documentos", "file"],
  ["settings", "Configuración", "settings"],
];
const ROUTES = Object.fromEntries(NAV.map(([key, label]) => [key, label]));
const DESCRIPTIONS = {
  dashboard: "Todo lo importante, de un vistazo",
  itinerary: "Organiza cada día sin prisas ni solapamientos",
  map: "Explora tus lugares y agrúpalos por zonas",
  places: "Tu colección de sitios por descubrir",
  purchases: "Caprichos, regalos y encargos bajo control",
  tasks: "Antes, durante y después del viaje",
  budget: "Previsión y gasto real en un mismo sitio",
  stays: "Tus alojamientos y check-ins",
  transport: "Todos tus trayectos, conectados",
  reservations: "Referencias y horarios siempre a mano",
  inspiration: "Vídeos e ideas que quieres recordar para este viaje",
  documents: "Enlaces y documentos importantes",
  settings: "Personaliza el viaje y protege tus datos",
};

const fields = {
  activity: [
    { name: "title", label: "Actividad", required: true, placeholder: "Ej. Visita a Kiyomizu-dera", full: true },
    { name: "date", label: "Fecha", type: "date", required: true },
    {
      name: "type",
      label: "Tipo",
      type: "select",
      options: ["Visita", "Comida", "Transporte", "Compras", "Check-in", "Vuelo", "Actividad", "Otro"],
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
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Planeado", "Visitado", "Descartado"] },
    { name: "description", label: "Descripción", type: "textarea", full: true },
    { name: "address", label: "Dirección", full: true },
    { name: "lat", label: "Latitud", type: "number", step: "any" },
    { name: "lng", label: "Longitud", type: "number", step: "any" },
    { name: "hours", label: "Horario" },
    { name: "estimatedPrice", label: "Precio estimado (¥)", type: "number", min: 0 },
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
    { name: "phase", label: "Momento", type: "select", options: ["Antes", "Durante", "Después"] },
    { name: "category", label: "Categoría", type: "select", options: CATEGORIES.task },
    { name: "priority", label: "Prioridad", type: "select", options: ["Alta", "Media", "Baja"] },
    { name: "dueDate", label: "Fecha límite", type: "date" },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Completada"] },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  purchase: [
    { name: "product", label: "Producto", required: true, full: true },
    { name: "category", label: "Categoría", type: "select", options: CATEGORIES.shopping },
    { name: "recipient", label: "Para quién" },
    { name: "city", label: "Ciudad" },
    { name: "store", label: "Tienda recomendada" },
    { name: "estimatedPrice", label: "Precio estimado (¥)", type: "number", min: 0 },
    { name: "maxBudget", label: "Presupuesto máximo (¥)", type: "number", min: 0 },
    { name: "priority", label: "Prioridad", type: "select", options: ["Alta", "Media", "Baja"] },
    {
      name: "status",
      label: "Estado",
      type: "select",
      options: ["Pendiente", "Encontrado", "Comprado", "No encontrado"],
    },
    { name: "actualPrice", label: "Precio real (¥)", type: "number", min: 0 },
    { name: "purchaseDate", label: "Fecha de compra", type: "date" },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  expense: [
    { name: "title", label: "Concepto", required: true, full: true },
    { name: "category", label: "Categoría", type: "select", options: CATEGORIES.expense },
    { name: "city", label: "Ciudad" },
    { name: "date", label: "Fecha", type: "date" },
    { name: "currency", label: "Moneda", type: "select", options: ["JPY", "EUR"] },
    { name: "estimatedAmount", label: "Importe previsto", type: "number", min: 0, step: "0.01" },
    { name: "actualAmount", label: "Importe pagado", type: "number", min: 0, step: "0.01" },
    { name: "paymentStatus", label: "Pago", type: "select", options: ["Pendiente", "Parcial", "Pagado"] },
    { name: "person", label: "Persona", type: "select", options: ["Ambos", "Persona 1", "Persona 2"] },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  fund: [
    { name: "title", label: "Concepto", required: true, placeholder: "Ej. Fondo inicial", full: true },
    { name: "contributor", label: "Aportado por", type: "select", required: true },
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "currency", label: "Moneda", type: "select", options: ["JPY", "EUR"] },
    { name: "amount", label: "Importe", type: "number", min: 0.01, step: "0.01", required: true },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  stay: [
    { name: "name", label: "Alojamiento", required: true, full: true },
    { name: "city", label: "Ciudad", required: true },
    { name: "address", label: "Dirección" },
    { name: "checkInDate", label: "Entrada", type: "date", required: true },
    { name: "checkInTime", label: "Hora de entrada", type: "time" },
    { name: "checkOutDate", label: "Salida", type: "date", required: true },
    { name: "checkOutTime", label: "Hora de salida", type: "time" },
    { name: "price", label: "Precio total (¥)", type: "number", min: 0 },
    { name: "paymentStatus", label: "Pago", type: "select", options: ["Pendiente", "Parcial", "Pagado"] },
    { name: "reference", label: "Número de reserva" },
    { name: "contact", label: "Contacto" },
    { name: "lat", label: "Latitud", type: "number", step: "any" },
    { name: "lng", label: "Longitud", type: "number", step: "any" },
    { name: "link", label: "Enlace", type: "url", full: true },
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
    { name: "price", label: "Precio (¥)", type: "number", min: 0 },
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
    { name: "paymentStatus", label: "Pago", type: "select", options: ["Pendiente", "Parcial", "Pagado"] },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Confirmada", "Realizada", "Cancelada"] },
    { name: "link", label: "Documento / enlace", type: "url", full: true },
    { name: "notes", label: "Notas", type: "textarea", full: true },
  ],
  document: [
    { name: "name", label: "Documento", required: true, full: true },
    {
      name: "type",
      label: "Tipo",
      type: "select",
      options: ["Billete", "Reserva", "PDF", "QR", "Seguro", "Pasaporte", "Confirmación", "Otro"],
    },
    { name: "reference", label: "Referencia" },
    { name: "expiryDate", label: "Caducidad", type: "date" },
    {
      name: "link",
      label: "Enlace seguro",
      type: "url",
      full: true,
      help: "Para proteger tus datos, Tabi guarda el enlace y no sube archivos a servidores.",
    },
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
  ],
};

function resolvedFields(type, values = {}) {
  return fields[type].map((field) => ({
    ...field,
    options: type === "fund" && field.name === "contributor"
      ? fundContributorOptions(store.getState().members, values.contributor)
      : typeof field.options === "function"
      ? field.options()
      : field.options,
  }));
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
function normalizedAmount(expense) {
  return expense.currency === "EUR"
    ? Number(expense.actualAmount || 0) / Number(store.getState().settings.exchangeRate || 1)
    : Number(expense.actualAmount || 0);
}
function normalizedExpenses() {
  return store.collection("expenses").map((item) => ({
    ...item,
    actualAmount: normalizedAmount(item),
    estimatedAmount: item.currency === "EUR"
      ? Number(item.estimatedAmount || 0) / Number(store.getState().settings.exchangeRate || 1)
      : Number(item.estimatedAmount || 0),
  }));
}
function normalizedFunds() {
  return store.collection("funds").map((item) => ({
    ...item,
    amount: item.currency === "EUR"
      ? Number(item.amount || 0) / Number(store.getState().settings.exchangeRate || 1)
      : Number(item.amount || 0),
  }));
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

function layout(content) {
  const trip = store.activeTrip;
  const addable = {
    itinerary: "Actividad",
    places: "Lugar",
    purchases: "Compra",
    tasks: "Tarea",
    budget: "Gasto",
    stays: "Alojamiento",
    transport: "Transporte",
    reservations: "Reserva",
    inspiration: "Inspiración",
    documents: "Documento",
  }[ui.route];
  const requiredPermission = ui.route === "budget"
    ? PERMISSIONS.BUDGET_EDIT
    : ui.route === "documents"
    ? PERMISSIONS.DOCUMENT_UPLOAD
    : PERMISSIONS.TRIP_EDIT;
  const members = store.collection("members");
  return `<div class="app-shell">
    <aside class="sidebar"><a class="brand" href="#dashboard"><span class="brand-mark">旅</span><span>Tabi<small>Travel planner</small></span></a><nav class="nav">${
    NAV.map(([r, l, i]) => navButton(r, l, i)).join("")
  }</nav><div class="sidebar-foot"><div class="trip-mini"><span class="emoji">${trip.emoji}</span><span><strong>${
    esc(trip.name)
  }</strong><small>${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}</small></span></div></div></aside>
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
  }</button>${
    addable && session.can(requiredPermission)
      ? `<button class="btn btn-primary" data-add="${ui.route}">${
        icon("plus")
      }<span>Añadir ${addable.toLowerCase()}</span></button>`
      : ""
  }</div></header><div class="content">${content}</div></main>
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
    budget: renderBudget,
    stays: renderStays,
    transport: renderTransport,
    reservations: renderReservations,
    inspiration: renderInspiration,
    documents: renderDocuments,
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
    }</button></section><aside class="auth-art"><div><h2>Planear juntos hace que el viaje empiece antes.</h2><p>Itinerario, presupuesto y reservas sincronizados para todo el equipo.</p></div></aside></main>`;
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
    }</div></main>`;
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
      { name: "currency", label: "Moneda", type: "select", options: ["JPY", "EUR"] },
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
  });
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
            }</select></div><div class="field full"><button class="btn btn-primary" type="submit">${
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
    const { tripId } = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await apiClient.post(`/trips/${tripId}/inspirations`, { url: link.url });
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
        ROLE_LABELS[invitation.role]
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
  const summary = budgetSummary(trip, expenses, store.collection("purchases"), normalizedFunds());
  const pendingTasks = store.collection("tasks").filter((task) => task.status !== "Completada");
  const pendingPurchases = store.collection("purchases").filter((item) =>
    item.status === "Pendiente" || item.status === "Encontrado"
  );
  const nextTransport =
    [...store.collection("transports")].filter((item) => item.departureDate >= today).sort((a, b) =>
      `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)
    )[0];
  const countdown = daysUntil(trip.startDate);
  const categoryTotals = groupTotals(expenses, "category");
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
      formatMoney(summary.remaining),
      `${Math.round(summary.spent / Math.max(summary.budget, 1) * 100)}% utilizado`,
      "",
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
      <section class="card card-pad"><div class="card-head"><div><h2>Gastos por categoría</h2><p>Importes reales convertidos a yenes</p></div><strong>${
    formatMoney(summary.spent)
  }</strong></div><div class="chart-bars">${
    categoryTotals.map(([label, value]) =>
      `<div class="chart-column"><div class="chart-bar" style="height:${Math.max(3, value / max * 100)}%" data-value="${
        formatMoney(value)
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
    formatMoney(pendingPurchases.reduce((sum, p) => sum + p.estimatedPrice, 0))
  } previstos</p></div></div><div class="item-list">${
    pendingPurchases.slice(0, 3).map((item) =>
      `<div class="list-item"><span class="stat-icon red">${icon("bag")}</span><div class="list-item-main"><strong>${
        esc(item.product)
      }</strong><small>${esc(item.city || "Sin ciudad")} · ${formatMoney(item.estimatedPrice)}</small></div></div>`
    ).join("")
  }</div></section>
      <section class="card card-pad"><div class="card-head"><div><h3>Actividad reciente</h3><p>Cambios de todo el equipo</p></div></div><div class="activity-feed">${
    store.collection("logs").slice(0, 5).map(activityLogRow).join("") ||
    `<p class="cell-sub">Todavía no hay actividad.</p>`
  }</div></section>
    </aside></div>
  </div>`;
}

function statCard(iconName, label, value, meta, tone) {
  return `<section class="card stat-card"><div class="stat-top"><span>${
    esc(label)
  }</span><span class="stat-icon ${tone}">${icon(iconName)}</span></div><div><div class="stat-value">${
    esc(value)
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
  };
  return `<div class="activity-row">${avatar({ name: log.userName, avatarUrl: log.avatarUrl })}<div><strong>${
    esc(log.userName)
  }</strong><span>${esc(messages[log.action] || "realizó un cambio")}</span><small>${
    relativeTime(log.createdAt)
  }</small></div></div>`;
}
function miniTimeline(items, showAction = true) {
  return items.length
    ? `<div class="timeline">${
      items.slice(0, 5).map((item) =>
        `<div class="timeline-item"><div class="timeline-time">${
          esc(item.start)
        }</div><div class="timeline-line"><span class="timeline-dot"></span></div><div class="timeline-info"><strong>${
          esc(item.title)
        }</strong><small>${esc(item.location || item.city || item.type)} · ${
          durationLabel(timeDiff(item.start, item.end))
        }</small></div></div>`
      ).join("")
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
  const stays = store.collection("stays").flatMap((stay) => [
    ...(stay.checkInDate === date
      ? [{
        id: `virtual-in-${stay.id}`,
        virtual: true,
        title: `Check-in · ${stay.name}`,
        date,
        start: stay.checkInTime || "15:00",
        end: addMinutes(stay.checkInTime || "15:00", 30),
        type: "Check-in",
        city: stay.city,
        location: stay.address,
      }]
      : []),
    ...(stay.checkOutDate === date
      ? [{
        id: `virtual-out-${stay.id}`,
        virtual: true,
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
  const transports = store.collection("transports").filter((item) => item.departureDate === date).map((item) => ({
    id: `virtual-trans-${item.id}`,
    virtual: true,
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
        ? analysis.sorted.map((item) =>
          `<div class="planner-event"><div class="planner-time">${esc(item.start)}<br><small>${
            esc(item.end)
          }</small></div><div class="event-card ${conflictIds.has(item.id) ? "conflict" : ""}" ${
            item.virtual ? "" : `draggable="true" data-drag-id="${item.id}"`
          } data-edit-activity="${item.id}"><span class="drag-handle">${
            item.virtual ? "•" : "⋮⋮"
          }</span><div class="event-body"><strong>${esc(item.title)}</strong><small>${
            esc(item.location || item.city || item.type)
          } · ${durationLabel(timeDiff(item.start, item.end))}</small></div>${activityMapsButton(item)}${
            item.virtual ? badge("Sincronizado", "blue") : badge(item.status === "done" ? "Realizado" : item.type)
          }</div></div>`
        ).join("")
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
  }">Día</button><button data-itinerary-view="week" class="${
    view === "week" ? "active" : ""
  }">Semana</button><button data-itinerary-view="overview" class="${
    view === "overview" ? "active" : ""
  }">General</button></div></div><div class="day-strip">${
    dates.map((item, index) =>
      `<button class="day-button ${item === date ? "active" : ""}" data-date="${item}"><small>${
        new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(new Date(`${item}T12:00`))
      }</small><strong>${item.slice(-2)}</strong><small>Día ${index + 1}</small></button>`
    ).join("")
  }</div><div class="section-title"><div><h2>${fullDate(date)}</h2><p>Día ${
    dates.indexOf(date) + 1
  } de ${dates.length}</p></div></div>${body}`;
}

function renderPlaces() {
  const places = filtered(store.collection("places"), ["name", "city", "area", "category"]);
  return `${toolbar(["Todos", ...CATEGORIES.place])}<div class="grid place-grid">${
    places.map((place) =>
      `<article class="card place-card"><div class="place-cover"><span>${
        badge(place.status)
      }</span><span class="place-symbol">${placeEmoji(place.category)}</span><span>${
        badge(place.priority, place.priority === "Alta" || place.priority === "Imprescindible" ? "red" : "")
      }</span></div><div class="place-body"><h3>${esc(place.name)}</h3><p>${
        esc(place.description || "Sin descripción")
      }</p><div class="place-meta"><span>${icon("pin")} ${esc(place.city)} · ${
        esc(place.area)
      }</span><button class="btn btn-ghost icon-btn" data-edit="places:${place.id}">${
        icon("edit")
      }</button></div></div></article>`
    ).join("") || emptyState("No hay lugares", "Prueba otro filtro o añade un lugar nuevo.")
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
      const values = {
        name: place.displayName || "",
        city: googlePlaceCity(place),
        address: place.formattedAddress || "",
        category: googlePlaceCategory(place.primaryType),
        hours: place.regularOpeningHours?.weekdayDescriptions?.join(" · ") || "",
        lat: place.location.lat(),
        lng: place.location.lng(),
        link: place.googleMapsURI || resolved,
      };
      Object.entries(values).forEach(([name, value]) => {
        const field = root.querySelector(`#field-${name}`);
        if (field) field.value = value;
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
  const [{ Map }, { AdvancedMarkerElement }, { PlaceAutocompleteElement }] = await Promise.all([
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
  places.forEach((place) => {
    const position = { lat: place.lat, lng: place.lng };
    bounds.extend(position);
    const marker = new AdvancedMarkerElement({ map, position, title: place.name });
    marker.addListener("click", () => {
      ui.mapPlaceId = place.id;
      render();
    });
  });
  if (places.length === 1) {
    map.setCenter({ lat: places[0].lat, lng: places[0].lng });
    map.setZoom(14);
  } else if (places.length > 1) {
    map.fitBounds(bounds, 70);
  }

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
    preview.innerHTML = `<div class="map-place-preview"><strong>${esc(place.displayName || "Lugar")}</strong><small>${
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
          status: "Pendiente",
          address: place.formattedAddress || "",
          lat: place.location.lat(),
          lng: place.location.lng(),
          link: place.googleMapsURI || "",
          googlePlaceId: place.id || "",
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
  const selected = places.find((p) => p.id === ui.mapPlaceId) || places[0];
  if (selected) ui.mapPlaceId = selected.id;
  return `<section class="card map-layout"><aside class="map-sidebar"><div id="google-place-search" class="google-place-search"><span class="cell-sub">Cargando buscador…</span></div><div id="google-place-preview"></div><div class="map-saved-head"><strong>Sitios guardados</strong><span>${places.length}</span></div><div class="item-list">${
    places.map((p) =>
      `<button class="list-item" style="cursor:pointer;text-align:left;color:inherit" data-map-place="${p.id}"><span class="stat-icon red">${
        placeEmoji(p.category)
      }</span><span class="list-item-main"><strong>${esc(p.name)}</strong><small>${esc(p.city)} · ${
        esc(p.area)
      }</small></span>${icon("chevron")}</button>`
    ).join("") || `<p class="cell-sub">Busca un sitio arriba para añadirlo al viaje.</p>`
  }</div>${
    selected
      ? `<div class="map-selected"><div><strong>${esc(selected.name)}</strong><small>${
        esc(selected.address)
      }</small></div><a class="btn btn-secondary" target="_blank" rel="noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}">${
        icon("external")
      } Cómo llegar</a></div>`
      : ""
  }</aside><div id="google-map" class="map-canvas"><div class="map-message"><span class="spinner"></span><p>Cargando Google Maps…</p></div></div></section>`;
}

function toolbar(filters = []) {
  return `<div class="toolbar"><div class="search">${icon("search")}<input data-search placeholder="Buscar…" value="${
    esc(ui.query)
  }"></div>${
    filters.length
      ? `<select data-filter style="max-width:190px">${
        filters.map((f) => `<option value="${esc(f)}" ${ui.filter === f ? "selected" : ""}>${esc(f)}</option>`).join("")
      }</select>`
      : ""
  }</div>`;
}
function filtered(items, keys) {
  const query = ui.query.trim().toLowerCase();
  return items.filter((item) =>
    (ui.filter === "Todos" || Object.values(item).includes(ui.filter)) &&
    (!query || keys.some((key) => String(item[key] || "").toLowerCase().includes(query)))
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

function renderPurchases() {
  const items = filtered(store.collection("purchases"), ["product", "city", "store", "recipient"]);
  const planned = items.reduce((s, i) => s + Number(i.estimatedPrice || 0), 0);
  const spent = items.reduce((s, i) => s + Number(i.actualPrice || 0), 0);
  return `<div class="grid grid-3" style="margin-bottom:18px">${
    statCard(
      "bag",
      "Artículos",
      items.length,
      `${items.filter((i) => i.status === "Comprado").length} comprados`,
      "red",
    )
  }${statCard("wallet", "Presupuesto previsto", formatMoney(planned), "Lista completa", "")}${
    statCard("check", "Gastado", formatMoney(spent), `${formatMoney(Math.max(0, planned - spent))} disponible`, "")
  }</div>${toolbar(["Todos", "Pendiente", "Encontrado", "Comprado", "No encontrado"])}${
    table(
      ["Producto", "Destino", "Estimado / máximo", "Prioridad", "Estado"],
      items.map((i) =>
        `<tr><td><span class="cell-main">${esc(i.product)}</span><span class="cell-sub">${esc(i.category)} · para ${
          esc(i.recipient || "—")
        }</span></td><td>${esc(i.city || "—")}<span class="cell-sub">${esc(i.store || "")}</span></td><td>${
          formatMoney(i.estimatedPrice)
        }<span class="cell-sub">máx. ${formatMoney(i.maxBudget)}</span></td><td>${
          badge(i.priority, i.priority === "Alta" ? "red" : "")
        }</td><td>${badge(i.status)}</td><td>${actions("purchases", i.id)}</td></tr>`
      ),
      "No hay compras",
    )
  }`;
}

function taskRow(task) {
  return `<div class="list-item"><button class="check ${
    task.status === "Completada" ? "checked" : ""
  }" data-toggle-task="${task.id}">${
    task.status === "Completada" ? icon("check") : ""
  }</button><div class="list-item-main ${task.status === "Completada" ? "done" : ""}"><strong>${
    esc(task.title)
  }</strong><small>${esc(task.category)}${task.dueDate ? ` · ${formatDate(task.dueDate)}` : ""}</small></div>${
    badge(task.priority, task.priority === "Alta" ? "red" : "")
  }<button class="btn btn-ghost icon-btn" data-edit="tasks:${task.id}">${icon("edit")}</button></div>`;
}
function renderTasks() {
  const items = filtered(store.collection("tasks"), ["title", "category", "phase"]);
  return `${toolbar(["Todos", "Antes", "Durante", "Después", "Pendiente", "Completada"])}<div class="grid grid-3">${
    ["Antes", "Durante", "Después"].map((phase) =>
      `<section class="card card-pad"><div class="card-head"><div><h2>${phase} del viaje</h2><p>${
        items.filter((i) => i.phase === phase && i.status !== "Completada").length
      } pendientes</p></div></div><div class="item-list">${
        items.filter((i) => i.phase === phase).map(taskRow).join("") ||
        emptyState("Nada por aquí", "No hay tareas en esta fase.")
      }</div></section>`
    ).join("")
  }</div>`;
}

function renderBudget() {
  const trip = store.activeTrip,
    expenses = normalizedExpenses(),
    purchases = store.collection("purchases"),
    funds = store.collection("funds"),
    summary = budgetSummary(trip, expenses, purchases, normalizedFunds()),
    percent = Math.min(100, summary.spent / Math.max(1, summary.budget) * 100),
    totals = groupTotals(expenses, "category"),
    max = Math.max(...totals.map(([, v]) => v), 1);
  const items = filtered(store.collection("expenses"), ["title", "category", "city", "person"]);
  return `<div class="grid dashboard-grid"><div class="section-stack"><section class="card card-pad budget-hero"><div><span class="hero-eyebrow" style="color:var(--muted)">Fondos disponibles</span><div class="stat-value" style="font-size:36px">${
    formatMoney(summary.remaining)
  }</div><p style="color:var(--muted)">de ${formatMoney(summary.budget)} · base ${
    formatMoney(summary.baseBudget)
  } + aportaciones ${formatMoney(summary.funded)}</p><div class="legend"><span style="--dot:var(--primary)">Gastado ${
    formatMoney(summary.spent)
  }</span><span style="--dot:var(--warning)">Comprometido ${
    formatMoney(summary.committed)
  }</span></div></div><div class="ring" style="--value:${percent}%"><div class="ring-label">${
    Math.round(percent)
  }%<small>utilizado</small></div></div></section><div class="grid grid-4">${
    statCard("wallet", "Fondos aportados", formatMoney(summary.funded), `${funds.length} aportaciones`, "")
  }${statCard("users", "Por persona", formatMoney(summary.perPerson), "Gasto real", "")}${
    statCard("clock", "Pendiente de pagar", formatMoney(summary.committed), "Gastos previstos", "amber")
  }${
    statCard("bag", "Compras previstas", formatMoney(summary.shoppingPlanned), "Aún no compradas", "red")
  }</div></div><section class="card card-pad"><div class="card-head"><div><h2>Distribución</h2><p>Gasto real por categoría</p></div></div><div class="chart-bars">${
    totals.map(([l, v]) =>
      `<div class="chart-column"><div class="chart-bar" style="height:${v / max * 100}%" data-value="${
        formatMoney(v)
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
          formatMoney(fund.amount, fund.currency)
        }</td><td>${actions("funds", fund.id)}</td></tr>`
      ),
      "Todavía no hay fondos aportados",
    )
  }<div class="section-title"><div><h2>Movimientos</h2><p>Previsto frente a pagado</p></div></div>${
    toolbar(["Todos", ...CATEGORIES.expense])
  }${
    table(
      ["Concepto", "Fecha", "Previsto", "Pagado", "Estado"],
      items.map((i) =>
        `<tr><td><span class="cell-main">${esc(i.title)}</span><span class="cell-sub">${esc(i.category)} · ${
          esc(i.city || "Sin ciudad")
        }</span></td><td>${formatDate(i.date)}</td><td>${formatMoney(i.estimatedAmount, i.currency)}</td><td>${
          formatMoney(i.actualAmount, i.currency)
        }</td><td>${badge(i.paymentStatus)}</td><td>${actions("expenses", i.id)}</td></tr>`
      ),
      "No hay movimientos",
    )
  }`;
}

function renderStays() {
  const items = filtered(store.collection("stays"), ["name", "city", "address", "reference"]);
  return `${toolbar()}<div class="grid grid-2">${
    items.map((i) =>
      `<section class="card card-pad"><div class="card-head"><div><h2>${esc(i.name)}</h2><p>${icon("pin")} ${
        esc(i.city)
      } · ${esc(i.address)}</p></div>${
        badge(i.paymentStatus)
      }</div><div class="grid grid-2"><div><span class="cell-sub">ENTRADA</span><strong>${
        formatDate(i.checkInDate)
      } · ${esc(i.checkInTime)}</strong></div><div><span class="cell-sub">SALIDA</span><strong>${
        formatDate(i.checkOutDate)
      } · ${esc(i.checkOutTime)}</strong></div></div><div class="progress" style="margin:18px 0"><span style="width:${
        i.paymentStatus === "Pagado" ? 100 : i.paymentStatus === "Parcial" ? 50 : 5
      }%"></span></div><div class="place-meta"><span>${formatMoney(i.price)} · Ref. ${
        esc(i.reference || "—")
      }</span><button class="btn btn-secondary" data-edit="stays:${i.id}">${
        icon("edit")
      } Editar</button></div></section>`
    ).join("") || emptyState("Sin alojamiento", "Añade un hotel, apartamento u otro alojamiento.")
  }</div>`;
}
function renderTransport() {
  const items = filtered(store.collection("transports"), ["type", "operator", "origin", "destination"]);
  return `${toolbar(["Todos", ...CATEGORIES.transport])}${
    table(
      ["Trayecto", "Salida", "Llegada", "Duración", "Reserva", "Estado"],
      items.map((i) =>
        `<tr><td><span class="cell-main">${esc(i.origin)} ${icon("arrow")} ${
          esc(i.destination)
        }</span><span class="cell-sub">${esc(i.type)} · ${esc(i.operator || "—")}</span></td><td>${
          formatDate(i.departureDate)
        }<span class="cell-sub">${esc(i.departureTime)}</span></td><td>${
          formatDate(i.arrivalDate)
        }<span class="cell-sub">${esc(i.arrivalTime)}</span></td><td>${durationLabel(i.duration)}</td><td>${
          esc(i.reservation || "Sin referencia")
        }<span class="cell-sub">${esc(i.seat || "")}</span></td><td>${badge(i.status)}</td><td>${
          actions("transports", i.id)
        }</td></tr>`
      ),
      "No hay transportes",
    )
  }`;
}
function renderReservations() {
  const items = filtered(store.collection("reservations"), ["title", "type", "reference"]);
  return `${toolbar(["Todos", "Hotel", "Restaurante", "Museo", "Actividad", "Transporte", "Entrada"])}${
    table(
      ["Reserva", "Fecha y hora", "Referencia", "Pago", "Estado", "Documento"],
      items.map((i) =>
        `<tr><td><span class="cell-main">${esc(i.title)}</span><span class="cell-sub">${esc(i.type)}</span></td><td>${
          formatDate(i.date)
        } · ${esc(i.time || "—")}</td><td>${esc(i.reference || "—")}</td><td>${badge(i.paymentStatus)}</td><td>${
          badge(i.status)
        }</td><td>${
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
  const items = [...filtered(enriched, ["url", "platform"])].reverse();
  return `<div class="insight inspiration-help" style="margin-bottom:18px">${
    icon("play")
  }<div><strong>Guarda ideas desde tus redes</strong>En Android, instala Tabi y utiliza Compartir → Tabi para elegir el viaje. En iOS esta función automática no está disponible: copia el enlace y añádelo manualmente aquí.</div></div>${
    toolbar(["Todos", "TikTok", "Instagram", "YouTube"])
  }<div class="grid grid-3 inspiration-grid">${
    items.map((item) => {
      const link = inspirationLink(item.url);
      if (!link) return "";
      return `<article class="card inspiration-card"><div class="inspiration-cover ${link.key}"><span>${
        icon("play")
      }</span><strong>${esc(link.platform)}</strong></div><div class="inspiration-body"><div>${
        badge(link.platform)
      }<span class="cell-sub">Guardado ${formatDate(item.createdAt)}</span></div><p>${
        esc(new URL(link.url).hostname.replace(/^www\./, ""))
      }</p><div class="place-meta"><a class="btn btn-primary" href="${
        esc(link.url)
      }" target="_blank" rel="noreferrer">${icon("external")} Ver en ${esc(link.platform)}</a>${
        session.can(PERMISSIONS.TRIP_EDIT)
          ? `<button class="btn btn-ghost icon-btn" data-edit="inspirations:${item.id}" aria-label="Editar enlace">${
            icon("edit")
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
function renderDocuments() {
  const items = filtered(store.collection("documents"), ["name", "type", "reference"]);
  return `<div class="insight warning" style="margin-bottom:18px">${
    icon("alert")
  }<div><strong>Privacidad primero</strong>Evita guardar números completos de pasaporte o datos sensibles. Los enlaces se comparten con los miembros autorizados del viaje.</div></div>${
    toolbar(["Todos", "Billete", "Reserva", "PDF", "QR", "Seguro", "Pasaporte", "Confirmación"])
  }<div class="grid grid-3">${
    items.map((i) =>
      `<section class="card card-pad"><div class="card-head"><span class="stat-icon red">${icon("file")}</span>${
        badge(i.type)
      }</div><h3>${esc(i.name)}</h3><p style="color:var(--muted)">Ref. ${esc(i.reference || "—")}${
        i.expiryDate ? ` · hasta ${formatDate(i.expiryDate)}` : ""
      }</p><div class="place-meta">${
        i.link
          ? `<a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${esc(i.link)}">${
            icon("external")
          } Abrir</a>`
          : `<span class="cell-sub">Sin enlace</span>`
      }<button class="btn btn-ghost icon-btn" data-edit="documents:${i.id}">${icon("edit")}</button></div></section>`
    ).join("") || emptyState("Sin documentos", "Añade enlaces a billetes, seguros o confirmaciones.")
  }</div>`;
}

function renderSettings() {
  const trip = store.activeTrip, s = store.getState().settings;
  const members = store.collection("members"), invitations = store.collection("invitations");
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
    ROLE_LABELS[session.currentMembership.role]
  }</strong></div></div></section>
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
  }>Sistema</option><option value="light" ${s.theme === "light" ? "selected" : ""}>Claro</option><option value="dark" ${
    s.theme === "dark" ? "selected" : ""
  }>Oscuro</option></select></div><div class="field full"><label>1 JPY equivale a EUR</label><input type="number" name="exchangeRate" step="0.0001" value="${s.exchangeRate}"></div><div class="field"><label>Inicio</label><input type="time" name="dayStart" value="${s.dayStart}"></div><div class="field"><label>Fin</label><input type="time" name="dayEnd" value="${s.dayEnd}"></div><div class="field full"><button class="btn btn-primary" type="submit">Guardar</button></div></form></section>
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
      ? `<select data-member-role="${member.user.id}" style="width:110px"><option value="editor" ${
        member.role === "editor" ? "selected" : ""
      }>Editor</option><option value="viewer" ${
        member.role === "viewer" ? "selected" : ""
      }>Viewer</option></select><button class="btn btn-ghost icon-btn" data-transfer-owner="${member.user.id}" aria-label="Transferir propiedad" title="Transferir propiedad">${
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
    ROLE_LABELS[invitation.role]
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
    : collection === "documents"
    ? PERMISSIONS.DOCUMENT_UPLOAD
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
    funds: ["fund", "Aportación"],
    stays: ["stay", "Alojamiento"],
    transports: ["transport", "Transporte"],
    reservations: ["reservation", "Reserva"],
    inspirations: ["inspiration", "Inspiración"],
    documents: ["document", "Documento"],
  }[collection];
  if (!config) return;
  const item = idValue ? store.collection(collection).find((i) => i.id === idValue) : null;
  const [type, label] = config;
  const defaults = {
    activity: { date: activeDate(), start: "09:00", end: "10:00", status: "planned" },
    place: { status: "Pendiente", priority: "Media", duration: 60 },
    task: { phase: "Antes", priority: "Media", status: "Pendiente" },
    purchase: { status: "Pendiente", priority: "Media", actualPrice: 0 },
    expense: { date: todayIso(), currency: "JPY", paymentStatus: "Pendiente", person: "Ambos" },
    fund: { title: "Aportación", contributor: session.currentUser.name, date: todayIso(), currency: "JPY" },
    stay: { checkInTime: "15:00", checkOutTime: "11:00", paymentStatus: "Pendiente" },
    transport: { departureDate: activeDate(), arrivalDate: activeDate(), status: "Por reservar" },
    reservation: { date: activeDate(), status: "Pendiente", paymentStatus: "Pendiente" },
    inspiration: {},
    document: { type: "Confirmación" },
  }[type] || {};
  modal({
    title: item ? `Editar ${label.toLowerCase()}` : `Nuevo ${label.toLowerCase()}`,
    fields: resolvedFields(type, item || defaults),
    values: item || defaults,
    dangerLabel: item ? "Eliminar" : "",
    onSubmit: async (values) => {
      if (type === "activity" && values.end <= values.start) {
        toast("La hora final debe ser posterior a la inicial.", "error");
        return;
      }
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
    onReady: type === "place" ? initializePlaceLinkImport : undefined,
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
  app.querySelectorAll("[data-route]").forEach((button) =>
    button.addEventListener("click", () => {
      const route = button.dataset.route;
      if (location.hash.slice(1) !== route) history.pushState({}, "", `#${route}`);
      ui.route = route;
      ui.query = "";
      ui.filter = "Todos";
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
        budget: "expenses",
        stays: "stays",
        transport: "transports",
        reservations: "reservations",
        inspiration: "inspirations",
        documents: "documents",
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
    dayStrip.scrollLeft = activeDay.offsetLeft - dayStrip.offsetLeft -
      (dayStrip.clientWidth - activeDay.clientWidth) / 2;
    dayStrip.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const maxScroll = dayStrip.scrollWidth - dayStrip.clientWidth;
      const canMove = (event.deltaY < 0 && dayStrip.scrollLeft > 0) ||
        (event.deltaY > 0 && dayStrip.scrollLeft < maxScroll);
      if (!canMove) return;
      event.preventDefault();
      dayStrip.scrollLeft += event.deltaY;
    }, { passive: false });
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
  app.querySelectorAll("[data-map-place]").forEach((button) =>
    button.addEventListener("click", () => {
      ui.mapPlaceId = button.dataset.mapPlace;
      render();
    })
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
    store.update((s) => Object.assign(s.settings, { ...values, exchangeRate: Number(values.exchangeRate) }));
    toast("Preferencias guardadas");
    render();
  });
  app.querySelector("[data-edit-trip]")?.addEventListener("click", editTrip);
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
      { name: "budget", label: "Presupuesto (¥)", type: "number", min: 0 },
    ],
    values: trip,
    onSubmit: async (values) => {
      await apiClient.patch(`/trips/${trip.id}`, { ...values, currency: trip.currency, version: trip.version });
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
  if (session.currentTrip) render();
});
store.subscribe(() => applyTheme());
applyTheme();
await start();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function start() {
  renderLoading();
  await session.restore();
  if (inviteTokenFromPath()) return renderInvitation();
  if (shareTargetFromPath()) return renderShareTarget();
  if (!session.currentUser) return renderAuth();
  renderTripsDashboard();
}
