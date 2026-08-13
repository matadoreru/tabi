import { parseReservationText } from "./reservation-import.js";

Deno.test("extrae los datos principales de una confirmación pegada", () => {
  const result = parseReservationText("Museo Ghibli\n17/09/2026 10:30\nReferencia ABC123\nTotal ¥ 12500");
  if (result.date !== "2026-09-17" || result.time !== "10:30" || result.reference !== "ABC123") {
    throw new Error(`Extracción inesperada: ${JSON.stringify(result)}`);
  }
  if (result.currency !== "JPY" || result.price !== 12500) throw new Error("No se extrajo el importe.");
});

Deno.test("interpreta importes internacionales sin perder separadores", () => {
  const usd = parseReservationText("Hotel\n2026-09-18\nTotal USD 1,234.56");
  if (usd.currency !== "USD" || usd.price !== 1234.56) throw new Error("Importe USD incorrecto.");
  const yen = parseReservationText("Ryokan\n2026-09-18\nTotal ¥ 125,000");
  if (yen.currency !== "JPY" || yen.price !== 125000) throw new Error("Importe JPY incorrecto.");
});
