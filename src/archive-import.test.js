import { formatArchiveImportError, parseTripArchiveJson, tripArchiveCompatibilityIssue } from "./archive-import.js";

function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

Deno.test("localiza la línea y columna de un JSON de viaje mal formado", () => {
  let received;
  try {
    parseTripArchiveJson('{\n  "format": "tabi-trip",\n  "trip": }', "tokio.json");
  } catch (error) {
    received = error;
  }
  assert(received instanceof SyntaxError);
  assert(received.message.includes("tokio.json"));
  assert(received.message.includes("línea 3"));
  assert(received.message.includes('"trip": }'));
});

Deno.test("explica qué parte de la cabecera del archivo no es compatible", () => {
  const issue = tripArchiveCompatibilityIssue({ format: "otro", schemaVersion: 3, trip: {}, collections: {} });
  assert(issue.includes("format"));
  assert(issue.includes("otro"));
});

Deno.test("formatea el contexto y todos los campos inválidos devueltos por la API", () => {
  const message = formatArchiveImportError({
    message: "Campo obligatorio.",
    code: "REQUIRED",
    details: {
      archive: { path: "collections.activities[2]", label: "Templo" },
      issues: [
        { path: "collections.activities[2].date", message: "Campo obligatorio." },
        { path: "collections.activities[2].start", message: "Campo obligatorio." },
      ],
    },
  }, "tokio.json");
  assert(message.includes("collections.activities[2]"));
  assert(message.includes("collections.activities[2].date"));
  assert(message.includes("Código: REQUIRED"));
});

Deno.test("muestra los campos generales relacionados cuando el servidor no devuelve una lista de incidencias", () => {
  const message = formatArchiveImportError({
    message: "Las fechas del viaje no son válidas.",
    code: "INVALID_DATES",
    details: { archive: { path: "trip", fields: ["startDate", "endDate"] } },
  });
  assert(message.includes("trip.startDate"));
  assert(message.includes("trip.endDate"));
});
