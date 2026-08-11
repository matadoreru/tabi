import { formatDate, searchKey } from "./ui.js";
import { EMOJI_GROUPS } from "./emojis.js";

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
