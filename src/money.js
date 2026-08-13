import { currencyDefinition, isSupportedCurrency } from "./currency.js";

/**
 * @typedef {{ currency: string, minorUnits: string, scale: number }} Money
 */

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

function decimalText(value, scale) {
  const source = String(value ?? "0").trim().replace(",", ".");
  if (/e/i.test(source)) return Number(source).toFixed(scale + 4);
  return source || "0";
}

/** Convert a user-facing decimal into exact minor units. */
export function decimalToMinor(value, currency) {
  const scale = currencyDefinition(currency).digits;
  const match = decimalText(value, scale).match(DECIMAL_PATTERN);
  if (!match) throw new TypeError("El importe no es un decimal válido.");
  const [, sign, whole, fraction = ""] = match;
  const padded = `${fraction}${"0".repeat(scale + 1)}`;
  let minor = BigInt(whole) * (10n ** BigInt(scale)) + BigInt(padded.slice(0, scale) || "0");
  if (Number(padded[scale] || 0) >= 5) minor += 1n;
  return (sign ? -minor : minor).toString();
}

export function minorToDecimal(minorUnits, currency) {
  const scale = currencyDefinition(currency).digits;
  const value = BigInt(String(minorUnits || "0"));
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  if (!scale) return `${sign}${absolute}`;
  const padded = absolute.toString().padStart(scale + 1, "0");
  return `${sign}${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}

export function createMoney(value, currency) {
  const code = String(currency || "").toUpperCase();
  if (!isSupportedCurrency(code)) throw new TypeError(`Moneda no soportada: ${code}`);
  return Object.freeze({
    currency: code,
    minorUnits: decimalToMinor(value, code),
    scale: currencyDefinition(code).digits,
  });
}

export function normalizeMoney(value, fallbackCurrency) {
  if (value && typeof value === "object" && isSupportedCurrency(value.currency) && /^-?\d+$/.test(value.minorUnits)) {
    const currency = String(value.currency).toUpperCase();
    return Object.freeze({
      currency,
      minorUnits: String(value.minorUnits),
      scale: currencyDefinition(currency).digits,
    });
  }
  return createMoney(value || 0, fallbackCurrency);
}

export function moneyToNumber(money) {
  return Number(minorToDecimal(money.minorUnits, money.currency));
}

export function addMoney(left, right) {
  if (left.currency !== right.currency) throw new TypeError("No se pueden sumar importes de monedas diferentes.");
  return Object.freeze({ ...left, minorUnits: (BigInt(left.minorUnits) + BigInt(right.minorUnits)).toString() });
}

function rateFraction(rate) {
  let text = String(rate).toLowerCase();
  if (text.includes("e")) text = Number(rate).toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  const match = text.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || Number(rate) <= 0) throw new TypeError("El tipo de cambio no es válido.");
  const fraction = match[2] || "";
  return { numerator: BigInt(`${match[1]}${fraction}`), denominator: 10n ** BigInt(fraction.length) };
}

function divideRounded(numerator, denominator) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

export function convertMoney(money, targetCurrency, rate) {
  const source = normalizeMoney(money, money.currency);
  const target = currencyDefinition(targetCurrency).code;
  if (source.currency === target) return normalizeMoney(source, target);
  const exchange = rateFraction(rate);
  const sourceScale = 10n ** BigInt(currencyDefinition(source.currency).digits);
  const targetScale = 10n ** BigInt(currencyDefinition(target).digits);
  const sourceMinor = BigInt(source.minorUnits);
  const absolute = sourceMinor < 0n ? -sourceMinor : sourceMinor;
  const converted = divideRounded(
    absolute * exchange.numerator * targetScale,
    exchange.denominator * sourceScale,
  );
  return Object.freeze({
    currency: target,
    minorUnits: (sourceMinor < 0n ? -converted : converted).toString(),
    scale: currencyDefinition(target).digits,
  });
}

export function allocateMoney(money, weights) {
  const normalized = weights.map((weight) => BigInt(String(weight)));
  const totalWeight = normalized.reduce((sum, weight) => sum + weight, 0n);
  if (totalWeight <= 0n) throw new TypeError("El reparto necesita al menos una parte positiva.");
  const total = BigInt(money.minorUnits);
  let assigned = 0n;
  return normalized.map((weight, index) => {
    const amount = index === normalized.length - 1 ? total - assigned : total * weight / totalWeight;
    assigned += amount;
    return Object.freeze({ ...money, minorUnits: amount.toString() });
  });
}

export function monetaryField(entity, field, fallbackCurrency) {
  const saved = entity?.money?.[field];
  return normalizeMoney(saved ?? entity?.[field] ?? 0, saved?.currency || entity?.currency || fallbackCurrency);
}

export function attachExactMoney(entity, fields, fallbackCurrency) {
  const currency = entity.currency || fallbackCurrency;
  const exact = { ...(entity.money || {}) };
  for (const field of fields) {
    if (entity[field] === undefined && exact[field] === undefined) continue;
    exact[field] = normalizeMoney(entity[field] ?? exact[field], currency);
    entity[field] = moneyToNumber(exact[field]);
  }
  if (Object.keys(exact).length) entity.money = exact;
  return entity;
}
