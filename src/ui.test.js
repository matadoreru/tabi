import { formatDate, searchKey, visualLabel, visualSymbol } from "./ui.js";
import { EMOJI_GROUPS } from "./emojis.js";
import { normalizePlaceAppearance, resolvePlaceBackground } from "./backgrounds.js";

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
  if (!source.includes('["notes", "Notas", "note"]') || !source.includes("function renderNotes()")) {
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
