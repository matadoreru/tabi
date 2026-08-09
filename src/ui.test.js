import { formatDate, searchKey } from "./ui.js";

function assertEquals(actual, expected) {
  if (actual !== expected) throw new Error(`Esperado ${expected}; recibido ${actual}`);
}

Deno.test("las rutas de recursos funcionan desde enlaces profundos", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  for (const asset of ["/manifest.webmanifest", "/assets/icon.svg", "/src/styles.css", "/src/app.js"]) {
    if (!html.includes(`\"${asset}\"`)) throw new Error(`Falta la ruta absoluta ${asset}`);
  }
});

Deno.test("normaliza búsquedas sin distinguir mayúsculas ni tildes", () => {
  assertEquals(searchKey("  JAPÓN "), "japon");
  assertEquals(searchKey("España"), "espana");
});

Deno.test("formatea fechas ISO con hora usadas por los miembros", () => {
  if (!formatDate("2026-08-09T19:00:00.000Z", { year: "numeric" }).includes("2026")) {
    throw new Error("La fecha ISO completa no se ha formateado");
  }
});
