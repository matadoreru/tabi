import { currencyDefinition } from "./currency.js";

const DATE_PATTERNS = [
  /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/,
];

const MONEY_TOKEN = "EUR|€|USD|\\$|JPY|¥|GBP|£|CHF|KRW|₩|CNY|CN¥|CAD|CA\\$|AUD|A\\$";
const CURRENCY_BY_TOKEN = Object.freeze({
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₩": "KRW",
  "CN¥": "CNY",
  "CA$": "CAD",
  "A$": "AUD",
});

function parseLocalizedNumber(value, currency) {
  let normalized = String(value || "").replaceAll(/\s/g, "");
  const decimalDigits = currencyDefinition(currency).digits;
  const lastDot = normalized.lastIndexOf(".");
  const lastComma = normalized.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    normalized = normalized.replaceAll(decimal === "." ? "," : ".", "").replace(decimal, ".");
  } else {
    const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : "";
    if (separator) {
      const tail = normalized.length - normalized.lastIndexOf(separator) - 1;
      normalized = tail === decimalDigits && decimalDigits > 0
        ? normalized.replaceAll(separator, ".")
        : normalized.replaceAll(separator, "");
    }
  }
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

export function parseReservationText(source) {
  const text = String(source || "").replaceAll("\r", "").trim();
  if (!text) throw new TypeError("Pega el contenido de la confirmación.");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let date = "";
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const [year, month, day] = match[1].length === 4 ? match.slice(1, 4) : [match[3], match[2], match[1]];
    date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    break;
  }
  const time = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const reference = text.match(
    /(?:reserva|booking|confirmation|referencia|reference|localizador)\s*(?:n[ºo.]?|#|:)?\s*([A-Z0-9-]{5,20})/i,
  );
  const money = text.match(new RegExp(`(?:${MONEY_TOKEN})\\s*([\\d.,]+)|([\\d.,]+)\\s*(${MONEY_TOKEN})`, "i"));
  const token = money?.[0].match(new RegExp(MONEY_TOKEN, "i"))?.[0] || "EUR";
  const upperToken = token.toUpperCase();
  const currency = CURRENCY_BY_TOKEN[token] ||
    (["EUR", "USD", "JPY", "GBP", "CHF", "KRW", "CNY", "CAD", "AUD"].includes(upperToken)
      ? upperToken
      : token === "$"
      ? "USD"
      : "EUR");
  const numeric = money ? parseLocalizedNumber(money[1] || money[2], currency) : 0;
  return {
    title: lines[0].slice(0, 120),
    date,
    time: time ? `${time[1].padStart(2, "0")}:${time[2]}` : "",
    reference: reference?.[1] || "",
    price: Number.isFinite(numeric) ? numeric : 0,
    currency,
    status: "Pendiente",
    paymentStatus: numeric > 0 ? "Pagado" : "Pendiente",
    notes: text.slice(0, 2000),
  };
}
