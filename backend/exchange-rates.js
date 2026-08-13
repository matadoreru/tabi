import { db } from "./database.js";
import { HttpError, now } from "./http.js";
import { isSupportedCurrency } from "../src/currency.js";

export const EXCHANGE_RATE_PROVIDER = "frankfurter";
export const EXCHANGE_RATE_TTL_MS = 12 * 60 * 60 * 1000;
export const EXCHANGE_RATE_FORCE_COOLDOWN_MS = 60 * 1000;
const providerUrl = (base, quote) => `https://api.frankfurter.dev/v2/rate/${base}/${quote}`;

function validatePair(base, quote) {
  const normalizedBase = String(base || "").toUpperCase();
  const normalizedQuote = String(quote || "").toUpperCase();
  if (!isSupportedCurrency(normalizedBase) || !isSupportedCurrency(normalizedQuote)) {
    throw new HttpError(422, "UNSUPPORTED_CURRENCY", "La moneda seleccionada no está soportada.");
  }
  return { base: normalizedBase, quote: normalizedQuote };
}

async function cachedRate(base, quote) {
  return await db.prepare("SELECT * FROM exchange_rates WHERE base_currency=? AND quote_currency=?").get(base, quote);
}

function responseData(row, stale = false) {
  return {
    base: row.base_currency,
    quote: row.quote_currency,
    rate: Number(row.rate),
    provider: row.provider,
    rateDate: dateOnly(row.rate_date),
    fetchedAt: isoValue(row.fetched_at),
    stale,
  };
}

function isoValue(value) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function dateOnly(value) {
  return isoValue(value).slice(0, 10);
}

export async function getExchangeRate(baseInput, quoteInput, { force = false, fetcher = fetch } = {}) {
  const { base, quote } = validatePair(baseInput, quoteInput);
  if (base === quote) {
    const timestamp = now();
    return { base, quote, rate: 1, provider: "identity", rateDate: timestamp.slice(0, 10), fetchedAt: timestamp };
  }
  const cached = await cachedRate(base, quote);
  const age = cached ? Date.now() - Date.parse(cached.fetched_at) : Infinity;
  const fresh = cached && age < EXCHANGE_RATE_TTL_MS;
  if (fresh && !force) return responseData(cached);
  if (cached && force && age < EXCHANGE_RATE_FORCE_COOLDOWN_MS) return responseData(cached);
  try {
    const response = await fetcher(providerUrl(base, quote), {
      headers: { accept: "application/json", "user-agent": "Tabi/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Proveedor respondió ${response.status}`);
    const payload = await response.json();
    const rate = Number(payload.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Tipo de cambio no válido");
    const fetchedAt = now();
    const rateDate = String(payload.date || fetchedAt.slice(0, 10));
    await db.prepare(
      `INSERT INTO exchange_rates(base_currency,quote_currency,rate,provider,rate_date,fetched_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(base_currency,quote_currency) DO UPDATE SET
       rate=excluded.rate,provider=excluded.provider,rate_date=excluded.rate_date,fetched_at=excluded.fetched_at`,
    ).run(base, quote, rate, EXCHANGE_RATE_PROVIDER, rateDate, fetchedAt);
    return responseData(await cachedRate(base, quote));
  } catch (error) {
    if (cached) {
      return { ...responseData(cached, true), warning: "No se pudo actualizar; se usa el último cambio conocido." };
    }
    throw new HttpError(
      503,
      "EXCHANGE_RATE_UNAVAILABLE",
      "No se ha podido obtener el tipo de cambio y todavía no hay un valor guardado.",
      { cause: String(error?.message || error) },
    );
  }
}
