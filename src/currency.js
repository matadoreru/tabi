export const CURRENCIES = Object.freeze([
  { code: "JPY", symbol: "¥", name: "Yen japonés", digits: 0 },
  { code: "EUR", symbol: "€", name: "Euro", digits: 2 },
  { code: "USD", symbol: "$", name: "Dólar estadounidense", digits: 2 },
  { code: "GBP", symbol: "£", name: "Libra esterlina", digits: 2 },
  { code: "CHF", symbol: "CHF", name: "Franco suizo", digits: 2 },
  { code: "KRW", symbol: "₩", name: "Won surcoreano", digits: 0 },
  { code: "CNY", symbol: "CN¥", name: "Yuan chino", digits: 2 },
  { code: "CAD", symbol: "CA$", name: "Dólar canadiense", digits: 2 },
  { code: "AUD", symbol: "A$", name: "Dólar australiano", digits: 2 },
]);

export const CURRENCY_CODES = Object.freeze(CURRENCIES.map(({ code }) => code));
const currencyByCode = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

export function currencyDefinition(code) {
  return currencyByCode.get(String(code || "").toUpperCase()) || currencyByCode.get("JPY");
}

export function isSupportedCurrency(code) {
  return currencyByCode.has(String(code || "").toUpperCase());
}

export function alternateCurrency(code) {
  const normalized = String(code || "").toUpperCase();
  return CURRENCY_CODES.find((candidate) => candidate !== normalized) || "JPY";
}

export function currencyOptions() {
  return CURRENCIES.map(({ code, symbol, name }) => ({ value: code, label: `${code} · ${symbol} · ${name}` }));
}

export function formatCurrency(amount, currency = "JPY", locale = "es-ES") {
  const definition = currencyDefinition(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: definition.code,
    minimumFractionDigits: definition.digits,
    maximumFractionDigits: definition.digits,
  }).format(Number(amount || 0));
}

export const rateKey = (base, quote) => `${String(base).toUpperCase()}:${String(quote).toUpperCase()}`;

export function rateBetween(base, quote, rates = {}) {
  const normalizedBase = String(base || "").toUpperCase();
  const normalizedQuote = String(quote || "").toUpperCase();
  if (normalizedBase === normalizedQuote) return 1;
  const direct = Number(rates[rateKey(normalizedBase, normalizedQuote)]);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const inverse = Number(rates[rateKey(normalizedQuote, normalizedBase)]);
  return Number.isFinite(inverse) && inverse > 0 ? 1 / inverse : null;
}

export function convertCurrency(amount, from, to, rates = {}) {
  const rate = rateBetween(from, to, rates);
  return rate === null ? null : Number(amount || 0) * rate;
}

export function tripCurrencyConfig(trip = {}, exchangeRates = {}) {
  const primary = isSupportedCurrency(trip.currency) ? trip.currency : "JPY";
  const secondaryCandidate = isSupportedCurrency(trip.secondaryCurrency)
    ? trip.secondaryCurrency
    : alternateCurrency(primary);
  const secondary = secondaryCandidate === primary ? alternateCurrency(primary) : secondaryCandidate;
  const rates = { ...exchangeRates };
  const manualRate = Number(trip.manualExchangeRate || trip.exchangeRate || 0);
  if (trip.exchangeRateMode === "manual" && manualRate > 0) {
    rates[rateKey(primary, secondary)] = manualRate;
    rates[rateKey(secondary, primary)] = 1 / manualRate;
  }
  return { primary, secondary, rates };
}

export function moneyAmounts(amount, originalCurrency, config) {
  const source = isSupportedCurrency(originalCurrency) ? originalCurrency : config.primary;
  const primaryAmount = convertCurrency(amount, source, config.primary, config.rates);
  const resolvedPrimary = primaryAmount ?? (source === config.primary ? Number(amount || 0) : null);
  const secondaryAmount = resolvedPrimary === null
    ? null
    : convertCurrency(resolvedPrimary, config.primary, config.secondary, config.rates);
  return { source, primaryAmount: resolvedPrimary, secondaryAmount };
}
