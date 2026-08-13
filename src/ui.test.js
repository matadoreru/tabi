import { formatDate, searchKey, visualLabel, visualSymbol } from "./ui.js";
import { EMOJI_GROUPS } from "./emojis.js";
import { automaticPlacePhotoUrl, normalizePlaceAppearance, resolvePlaceBackground } from "./backgrounds.js";

function assertEquals(actual, expected) {
  if (actual !== expected) throw new Error(`Esperado ${expected}; recibido ${actual}`);
}

Deno.test("las rutas de recursos funcionan desde enlaces profundos", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  for (const asset of ["/manifest.webmanifest", "/assets/icon.svg", "/src/styles.css", "/src/app.js"]) {
    if (!html.includes(`\"${asset}\"`)) throw new Error(`Falta la ruta absoluta ${asset}`);
  }
});

Deno.test("la PWA se registra como destino para enlaces compartidos", async () => {
  const manifest = JSON.parse(await Deno.readTextFile(new URL("../manifest.webmanifest", import.meta.url)));
  assertEquals(manifest.share_target.action, "/share");
  assertEquals(manifest.share_target.method, "GET");
  assertEquals(manifest.share_target.params.url, "url");
  assertEquals(manifest.share_target.params.text, "text");
});

Deno.test("normaliza búsquedas sin distinguir mayúsculas ni tildes", () => {
  assertEquals(searchKey("  JAPÓN "), "japon");
  assertEquals(searchKey("España"), "espana");
});

Deno.test("los estados y filtros combinan símbolos reconocibles con texto", () => {
  assertEquals(visualLabel("Pendiente"), "⏳ Pendiente");
  assertEquals(visualLabel("Airbnb"), "🏠 Airbnb");
  assertEquals(visualSymbol("Confirmada"), "🔒");
  assertEquals(visualSymbol("Parcial"), "🌓");
  assertEquals(visualSymbol("Hotel"), "🏨");
  assertEquals(visualSymbol("Actividad"), "🎯");
  assertEquals(visualSymbol("Entrada"), "🎟️");
  if (visualSymbol("Visto") === visualSymbol("No visto")) throw new Error("Visto y No visto deben distinguirse");
  assertEquals(visualLabel("Valor personalizado"), "Valor personalizado");
});

Deno.test("el autocompletado oculta las opciones que no coinciden", async () => {
  const css = await Deno.readTextFile(new URL("./styles.css", import.meta.url));
  if (!/\.autocomplete-options button\[hidden\]\s*{\s*display:\s*none;\s*}/.test(css)) {
    throw new Error("Las opciones filtradas del autocompletado deben permanecer ocultas");
  }
});

Deno.test("formatea fechas ISO con hora usadas por los miembros", () => {
  if (!formatDate("2026-08-09T19:00:00.000Z", { year: "numeric" }).includes("2026")) {
    throw new Error("La fecha ISO completa no se ha formateado");
  }
});

Deno.test("ofrece un catálogo amplio y buscable de emojis para los lugares", () => {
  const entries = EMOJI_GROUPS.flatMap((category) =>
    category.groups.flatMap(([keywords, emojis]) =>
      emojis.split(/\s+/).map((emoji) => ({ emoji, search: searchKey(`${category.label} ${keywords}`) }))
    )
  );
  if (new Set(entries.map(({ emoji }) => emoji)).size < 1_000) {
    throw new Error("El catálogo de emojis es demasiado corto");
  }
  for (const query of ["cara", "gato", "comida", "avion", "objeto", "japon", "bandera"]) {
    if (!entries.some(({ search }) => search.includes(query))) {
      throw new Error(`No se puede buscar la categoría ${query}`);
    }
  }
  if (!entries.some(({ emoji }) => emoji === "📍")) throw new Error("Falta el marcador predeterminado");
});

Deno.test("los formularios avisan antes de descartar cambios", async () => {
  const source = await Deno.readTextFile(new URL("./ui.js", import.meta.url));
  if (!source.includes("Hay cambios sin guardar")) {
    throw new Error("El modal debe proteger los datos introducidos ante un cierre accidental");
  }
});

Deno.test("el mapa muestra el detalle antes de la lista y permite limpiar la selección", async () => {
  const source = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  const mapView = source.slice(source.indexOf("function renderMap()"), source.indexOf("function toolbar("));
  if (mapView.indexOf('class="map-selected"') > mapView.indexOf('class="map-saved-head"')) {
    throw new Error("El lugar seleccionado debe aparecer antes de la lista de lugares");
  }
  if (!source.includes('map.addListener("click", (event) =>') || !source.includes("clearSelectedPlace();")) {
    throw new Error("El mapa debe limpiar la selección al pulsar fuera de un marcador");
  }
});

Deno.test("la interfaz integra notas, fotos y un asa de arrastre inequívoca", async () => {
  const source = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  const navigation = await Deno.readTextFile(new URL("./navigation.js", import.meta.url));
  if (!navigation.includes('["notes", "Notas", "note"]') || !source.includes("function renderNotes()")) {
    throw new Error("Falta el apartado de notas");
  }
  if (!source.includes('type: "image"') || !source.includes('"photos"')) {
    throw new Error("Falta el soporte visual de compras o Google Places");
  }
  if (source.includes("⋮⋮") || !source.includes('icon("grip")')) {
    throw new Error("El asa de actividades debe usar una única columna de puntos");
  }
});

Deno.test("TODO es una lista única con responsable e información", async () => {
  const source = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  if (!source.includes("<h2>Lista TODO</h2>")) throw new Error("TODO debe mostrarse como una lista única");
  if (!source.includes('name: "assigneeId"')) throw new Error("Las tareas deben admitir responsable");
  if (!source.includes('label: "Información"')) throw new Error("Las tareas deben mostrar su información");
  if (source.includes('name: "phase"')) throw new Error("El formulario no debe separar tareas por fases del viaje");
});

Deno.test("las acciones principales viven junto a su contenido y Documentos no existe", async () => {
  const source = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  if (!source.includes("function addAction(")) throw new Error("Falta el patrón común de acciones de sección");
  if (source.includes('["documents", "Documentos"') || source.includes("renderDocuments")) {
    throw new Error("La sección Documentos debe estar eliminada");
  }
});

Deno.test("la apariencia manual de un lugar tiene prioridad sobre la foto de Google", () => {
  const custom = resolvePlaceBackground({
    backgroundMode: "color",
    backgroundColor: "#123456",
    photoUrl: "https://example.com/google.jpg",
  });
  assertEquals(custom.type, "color");
  assertEquals(custom.value, "#123456");
  const legacy = resolvePlaceBackground({ photoUrl: "https://example.com/google.jpg" });
  assertEquals(legacy.type, "image");
  assertEquals(legacy.automatic, true);
  assertEquals(normalizePlaceAppearance({ backgroundMode: "desconocido" }).mode, "auto");
  assertEquals(
    automaticPlacePhotoUrl({ googlePhotoName: "places/demo/photos/first", photoUrl: "https://old.example/photo" }),
    "/api/maps/photo?name=places%2Fdemo%2Fphotos%2Ffirst",
  );
});

Deno.test("compras e itinerario incorporan visor y selector horizontal accesibles", async () => {
  const source = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  const lightbox = await Deno.readTextFile(new URL("./lightbox.js", import.meta.url));
  if (!source.includes('data-lightbox="purchase-') || !lightbox.includes('event.key === "Escape"')) {
    throw new Error("Las fotografías de compras deben abrir el visor reutilizable y cerrarse con Escape");
  }
  if (!source.includes('role="tablist"') || !source.includes('aria-selected="${selected}"')) {
    throw new Error("El selector de días debe exponer semántica de pestañas");
  }
});

Deno.test("Presupuesto muestra trayectos y Google Places confirma la foto automática", async () => {
  const source = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  if (!source.includes('sourceCollection: "transports"') || !source.includes('category: "Transporte"')) {
    throw new Error("Los transportes guardados deben mostrarse como movimientos del presupuesto");
  }
  if (!source.includes("updateGooglePhotoPreview(root, photo.photoUrl)")) {
    throw new Error("El formulario debe confirmar visualmente la fotografía obtenida de Google Places");
  }
  if (!source.includes("backgroundMode = PLACE_BACKGROUND_MODES.AUTO")) {
    throw new Error("La fotografía de Google debe activar explícitamente el fondo automático");
  }
});

Deno.test("Itinerario es exclusivamente diario y la navegación conserva el orden acordado", async () => {
  const source = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  const navigation = await Deno.readTextFile(new URL("./navigation.js", import.meta.url));
  if (source.includes("data-itinerary-view") || source.includes("itineraryView")) {
    throw new Error("Itinerario no debe conservar selectores ni estado semanal/general");
  }
  const expectedNavigation = [
    '["dashboard", "Dashboard"',
    '["itinerary", "Itinerario"',
    '["map", "Mapa"',
    '["places", "Lugares"',
    '["reservations", "Reservas"',
    '["stays", "Hospedaje"',
    '["transport", "Transporte"',
    '["budget", "Presupuesto"',
    '["purchases", "Compras"',
    '["tasks", "TODO"',
    '["notes", "Notas"',
    '["inspiration", "Inspiración"',
    '["settings", "Configuración"',
  ];
  let previous = -1;
  for (const entry of expectedNavigation) {
    const index = navigation.indexOf(entry);
    if (index <= previous) throw new Error(`La navegación está desordenada cerca de ${entry}`);
    previous = index;
  }
});

Deno.test("la cuenta ofrece recuperación segura y cierre de otras sesiones", async () => {
  const source = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  if (!source.includes("data-recover") || !source.includes('"/auth/recover"')) {
    throw new Error("Falta el flujo de recuperación de cuenta");
  }
  if (!source.includes("data-recovery-codes") || !source.includes('"/auth/sessions/revoke-others"')) {
    throw new Error("Faltan los controles de códigos y sesiones");
  }
});

Deno.test("Fase 2 integra zonas, calendario, trayectos, colaboración y tablas móviles", async () => {
  const app = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  const css = await Deno.readTextFile(new URL("./styles.css", import.meta.url));
  const api = await Deno.readTextFile(new URL("../backend/api.js", import.meta.url));
  for (
    const marker of [
      "timeZoneOptions",
      "data-export-ics",
      "data-calculate-routes",
      "data-comments",
      "data-add-reminder",
    ]
  ) {
    if (!app.includes(marker)) throw new Error(`Falta la integración ${marker}`);
  }
  if (!css.includes("content: attr(data-label)") || !css.includes(".skip-link")) {
    throw new Error("Las tablas móviles o el salto accesible no están integrados");
  }
  if (!api.includes('resource === "comments"') || !api.includes('resource === "route-estimates"')) {
    throw new Error("Faltan endpoints desacoplados de colaboración o rutas");
  }
});

Deno.test("Fase 3 ofrece dashboard contextual, plantillas y actualización PWA controlada", async () => {
  const app = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  const sw = await Deno.readTextFile(new URL("../sw.js", import.meta.url));
  const manifest = JSON.parse(await Deno.readTextFile(new URL("../manifest.webmanifest", import.meta.url)));
  for (
    const marker of [
      "TRIP_PHASES.BEFORE",
      "TRIP_PHASES.DURING",
      "TRIP_PHASES.AFTER",
      "duplicateTripDialog",
      "data-save-template",
      "data-refresh-pwa",
    ]
  ) {
    if (!app.includes(marker)) throw new Error(`Falta ${marker}`);
  }
  if (!sw.includes("SKIP_WAITING") || sw.includes("cache.addAll(ASSETS)).then(() => self.skipWaiting())")) {
    throw new Error("Las actualizaciones PWA deben requerir confirmación");
  }
  if (!Array.isArray(manifest.shortcuts) || manifest.shortcuts.length < 3) {
    throw new Error("El manifiesto no ofrece suficientes accesos rápidos");
  }
});

Deno.test("los viajes en grupo integran reparto, votación, modo Hoy y utilidades durante el viaje", async () => {
  const app = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  const api = await Deno.readTextFile(new URL("../backend/api.js", import.meta.url));
  const database = await Deno.readTextFile(new URL("../backend/database.js", import.meta.url));
  for (
    const marker of [
      "splitParticipantIds",
      "data-settle-transfer",
      "renderToday",
      "renderNotifications",
      "data-vote-proposal",
      "data-share-location",
      "data-task-template",
      "data-import-reservation",
      "itineraryAvailabilityWarnings",
    ]
  ) {
    if (!app.includes(marker)) throw new Error(`Falta la experiencia de grupo ${marker}`);
  }
  for (const marker of ['resource === "participants"', 'resource === "settlements"', 'parts[4] === "vote"']) {
    if (!api.includes(marker)) throw new Error(`Falta el endpoint ${marker}`);
  }
  for (const table of ["trip_participants", "expense_splits", "settlement_payments", "notification_reads"]) {
    if (!database.includes(table)) throw new Error(`Falta persistencia para ${table}`);
  }
});

Deno.test("el buscador global conserva el cursor al actualizar resultados", async () => {
  const app = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  if (!app.includes("globalSearch.selectionStart") || !app.includes("nextSearch?.setSelectionRange")) {
    throw new Error("El buscador perdería la posición del cursor al volver a renderizarse.");
  }
});

Deno.test("Dashboard y Presupuesto importan sus operaciones monetarias", async () => {
  const app = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  if (!/import \{[^}]*\bconvertMoney\b[^}]*\} from "\.\/money\.js";/s.test(app)) {
    throw new Error("convertMoney debe importarse antes de renderizar importes canónicos.");
  }
});

Deno.test("las acciones de colecciones nuevas abren su editor", async () => {
  const app = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  for (const collection of ["availabilities", "emergencyContacts", "journalEntries", "proposals"]) {
    if (!app.includes(`data-add="${collection}"`)) {
      throw new Error(`Falta la acción para añadir ${collection}.`);
    }
  }
  if (!app.includes("ADD_ROUTE_ALIASES[button.dataset.add] || button.dataset.add")) {
    throw new Error("Las acciones nuevas no resuelven directamente su colección.");
  }
});

Deno.test("la transferencia de proyectos usa etiquetas orientadas al viaje", async () => {
  const app = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  if (!app.includes("Exportar viaje") || !app.includes("Importar viaje")) {
    throw new Error("Las acciones deben indicar claramente que transfieren el viaje.");
  }
  if (app.includes("Exportar para ChatGPT") || app.includes("Importar cambios")) {
    throw new Error("Quedan etiquetas antiguas en la transferencia del viaje.");
  }
});

Deno.test("el mapa móvil permite compartir ubicación y el visor no muestra flechas laterales", async () => {
  const app = await Deno.readTextFile(new URL("./app.js", import.meta.url));
  const css = await Deno.readTextFile(new URL("./styles.css", import.meta.url));
  const lightbox = await Deno.readTextFile(new URL("./lightbox.js", import.meta.url));
  if (!app.includes('data-share-location aria-label="Compartir ubicación durante 30 minutos"')) {
    throw new Error("La acción de ubicación no es accesible en el mapa móvil.");
  }
  if (!css.includes(".map-location-share span") || !css.includes("z-index: 12")) {
    throw new Error("Falta la presentación móvil de la acción de ubicación.");
  }
  if (lightbox.includes("data-lightbox-previous") || lightbox.includes("data-lightbox-next")) {
    throw new Error("El visor no debe mostrar botones laterales de navegación.");
  }
});
