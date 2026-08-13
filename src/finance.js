import { monetaryField } from "./money.js";

export const FINANCIAL_COLLECTIONS = Object.freeze([
  "expenses",
  "purchases",
  "stays",
  "transports",
  "reservations",
  "funds",
]);

/** Reduces participant balances to a deterministic set of transfers per currency. */
export function simplifySettlementBalances(balances = []) {
  const transfers = [];
  for (const currency of new Set(balances.map((balance) => balance.currency))) {
    const creditors = balances.filter((entry) => entry.currency === currency && BigInt(entry.minorUnits) > 0n)
      .map((entry) => ({ ...entry, remaining: BigInt(entry.minorUnits) }));
    const debtors = balances.filter((entry) => entry.currency === currency && BigInt(entry.minorUnits) < 0n)
      .map((entry) => ({ ...entry, remaining: -BigInt(entry.minorUnits) }));
    let creditorIndex = 0;
    let debtorIndex = 0;
    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];
      const amount = creditor.remaining < debtor.remaining ? creditor.remaining : debtor.remaining;
      transfers.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        amount: { currency, minorUnits: amount.toString() },
      });
      creditor.remaining -= amount;
      debtor.remaining -= amount;
      if (creditor.remaining === 0n) creditorIndex++;
      if (debtor.remaining === 0n) debtorIndex++;
    }
  }
  return transfers;
}

function transaction(sourceCollection, source, kind, field, options = {}) {
  const amount = options.amount || monetaryField(source, field, options.fallbackCurrency);
  if (BigInt(amount.minorUnits) <= 0n) return null;
  return {
    key: `${sourceCollection}:${source.id}:${kind}`,
    sourceCollection,
    sourceId: source.id,
    kind,
    category: options.category || source.category || sourceCollection,
    state: options.state || "confirmed",
    amount,
    payerId: source.paidByUserId || source.paidById || source.payerId || null,
    payerParticipantId: source.paidByParticipantId || null,
    occurredOn: source.date || source.departureDate || source.checkInDate || null,
    title: source.title || source.product || source.name || `${source.origin || ""} – ${source.destination || ""}`,
    exchange: source.exchangeRateSnapshot
      ? {
        rate: String(source.exchangeRateSnapshot),
        base: source.exchangeRateBase,
        quote: source.exchangeRateQuote,
        date: source.exchangeRateDate,
        provider: source.exchangeRateProvider,
      }
      : null,
  };
}

export function entityFinancialTransactions(collection, item, fallbackCurrency) {
  const rows = [];
  const add = (kind, field, options) => {
    const row = transaction(collection, item, kind, field, { fallbackCurrency, ...options });
    if (row) rows.push(row);
  };
  if (collection === "expenses") {
    add("paid", "actualAmount", { category: item.category || "Otros" });
    const estimated = monetaryField(item, "estimatedAmount", fallbackCurrency);
    const paid = monetaryField(item, "actualAmount", fallbackCurrency);
    if (estimated.currency === paid.currency && BigInt(estimated.minorUnits) > BigInt(paid.minorUnits)) {
      const pending = { ...estimated, minorUnits: (BigInt(estimated.minorUnits) - BigInt(paid.minorUnits)).toString() };
      rows.push({
        ...transaction(collection, item, "committed", "estimatedAmount", { fallbackCurrency }),
        amount: pending,
      });
    }
  } else if (collection === "purchases") {
    add("paid", "actualPrice", { category: "Compras" });
    if (!Number(item.actualPrice || 0)) add("planned", "estimatedPrice", { category: "Compras", state: "planned" });
  } else if (["stays", "transports", "reservations"].includes(collection)) {
    if (collection === "reservations" && item.budgetMode === "reference") return [];
    const cancelled = item.bookingStatus === "Cancelada" || item.status === "Cancelado" || item.status === "Cancelada";
    if (cancelled) return [];
    const category = collection === "stays"
      ? "Alojamiento"
      : collection === "transports"
      ? "Transporte"
      : item.type || "Reservas";
    const total = monetaryField(item, "price", fallbackCurrency);
    let paid = monetaryField(item, "paidAmount", fallbackCurrency);
    if (item.paymentStatus === "Pagado") paid = total;
    if (BigInt(paid.minorUnits) > 0n) {
      rows.push(transaction(collection, item, "paid", "paidAmount", { fallbackCurrency, category, amount: paid }));
    }
    if (total.currency === paid.currency && BigInt(total.minorUnits) > BigInt(paid.minorUnits)) {
      rows.push({
        ...transaction(collection, item, "committed", "price", { fallbackCurrency, category }),
        amount: { ...total, minorUnits: (BigInt(total.minorUnits) - BigInt(paid.minorUnits)).toString() },
      });
    }
  } else if (collection === "funds") {
    add("fund", "amount", { category: "Fondos" });
  }
  return rows.filter(Boolean);
}

export function projectFinancialTransactions(trip, collections) {
  return FINANCIAL_COLLECTIONS.flatMap((collection) =>
    (collections[collection] || []).flatMap((item) => entityFinancialTransactions(collection, item, trip.currency))
  );
}

export function canonicalBudgetSummary(trip, transactions, convertAmount) {
  const total = (kind, predicate = () => true) =>
    transactions
      .filter((entry) => entry.kind === kind && predicate(entry))
      .reduce((sum, entry) => sum + convertAmount(entry.amount, entry), 0);
  const baseBudget = Number(trip?.budget || 0);
  const funded = total("fund");
  const spent = total("paid") - total("refund");
  const committed = total("committed");
  const shoppingPlanned = total("planned", (entry) => entry.category === "Compras");
  const category = (label, kind) => total(kind, (entry) => entry.category === label);
  const budget = baseBudget + funded;
  return {
    budget,
    baseBudget,
    funded,
    spent,
    committed,
    shoppingPlanned,
    lodgingSpent: category("Alojamiento", "paid"),
    lodgingCommitted: category("Alojamiento", "committed"),
    transportSpent: category("Transporte", "paid"),
    transportCommitted: category("Transporte", "committed"),
    remaining: budget - spent,
    projected: spent + committed + shoppingPlanned,
    perPerson: spent / Math.max(1, Number(trip?.travelers || 1)),
  };
}
