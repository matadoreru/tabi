import { db, entityTable, transaction } from "./database.js";
import { newId, now } from "./http.js";
import { entityFinancialTransactions, FINANCIAL_COLLECTIONS } from "../src/finance.js";
import { allocateMoney, monetaryField } from "../src/money.js";

const PROJECTION_VERSION = 1;

function jsonObject(value) {
  return typeof value === "string" ? JSON.parse(value) : value || {};
}

function readSource(row) {
  return { ...jsonObject(row.data), id: row.id };
}

export async function syncFinancialSource(tripId, collection, item, tripCurrency, timestamp = now()) {
  if (!FINANCIAL_COLLECTIONS.includes(collection)) return;
  await db.prepare("DELETE FROM financial_transactions WHERE trip_id=? AND source_collection=? AND source_id=?")
    .run(tripId, collection, item.id);
  for (const entry of entityFinancialTransactions(collection, item, tripCurrency)) {
    await db.prepare(
      `INSERT INTO financial_transactions(
        id,trip_id,source_collection,source_id,kind,category,state,amount_minor,currency,payer_id,occurred_on,title,metadata,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      newId("fin"),
      tripId,
      collection,
      item.id,
      entry.kind,
      entry.category,
      entry.state,
      entry.amount.minorUnits,
      entry.amount.currency,
      entry.payerId,
      entry.occurredOn,
      entry.title,
      entry.exchange ? { exchange: entry.exchange } : {},
      timestamp,
      timestamp,
    );
  }
  await syncExpenseSplits(tripId, collection, item, tripCurrency, timestamp);
}

async function syncExpenseSplits(tripId, collection, item, tripCurrency, timestamp) {
  await db.prepare("DELETE FROM expense_splits WHERE trip_id=? AND source_collection=? AND source_id=?")
    .run(tripId, collection, item.id);
  const requested = Array.isArray(item.splits)
    ? item.splits.filter((split) => split?.memberUserId || split?.participantName)
    : [];
  if (!requested.length) return;
  const paidField = collection === "expenses"
    ? "actualAmount"
    : collection === "purchases"
    ? "actualPrice"
    : "paidAmount";
  const total = monetaryField(item, paidField, tripCurrency);
  if (BigInt(total.minorUnits) <= 0n) return;
  const explicit = requested.every((split) => /^\d+$/.test(String(split.amountMinor || "")));
  const amounts = explicit
    ? requested.map((split) => ({ ...total, minorUnits: String(split.amountMinor) }))
    : allocateMoney(total, requested.map((split) => Math.max(1, Number(split.weight || 1))));
  if (amounts.reduce((sum, amount) => sum + BigInt(amount.minorUnits), 0n) !== BigInt(total.minorUnits)) {
    throw new TypeError("El reparto debe coincidir con el importe pagado.");
  }
  for (let index = 0; index < requested.length; index++) {
    const split = requested[index];
    await db.prepare(
      `INSERT INTO expense_splits(
        id,trip_id,source_collection,source_id,member_user_id,participant_name,amount_minor,currency,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      newId("spl"),
      tripId,
      collection,
      item.id,
      split.memberUserId || null,
      String(split.participantName || ""),
      amounts[index].minorUnits,
      total.currency,
      timestamp,
      timestamp,
    );
  }
}

export async function ensureFinancialProjection(tripId, tripCurrency) {
  if (
    await db.prepare("SELECT 1 FROM financial_projection_state WHERE trip_id=? AND projection_version=?").get(
      tripId,
      PROJECTION_VERSION,
    )
  ) return;
  await transaction(async () => {
    for (const collection of FINANCIAL_COLLECTIONS) {
      const rows = await db.prepare(`SELECT * FROM ${entityTable(collection)} WHERE trip_id=?`).all(tripId);
      for (const row of rows) await syncFinancialSource(tripId, collection, readSource(row), tripCurrency);
    }
    await db.prepare(
      "INSERT INTO financial_projection_state(trip_id,projection_version,projected_at) VALUES (?,?,?) ON CONFLICT(trip_id) DO UPDATE SET projection_version=excluded.projection_version,projected_at=excluded.projected_at",
    ).run(tripId, PROJECTION_VERSION, now());
  });
}

export async function removeFinancialSource(tripId, collection, sourceId) {
  if (!FINANCIAL_COLLECTIONS.includes(collection)) return;
  await db.prepare("DELETE FROM financial_transactions WHERE trip_id=? AND source_collection=? AND source_id=?")
    .run(tripId, collection, sourceId);
  await db.prepare("DELETE FROM expense_splits WHERE trip_id=? AND source_collection=? AND source_id=?")
    .run(tripId, collection, sourceId);
}

export async function financialState(tripId) {
  const transactions = await db.prepare(
    "SELECT * FROM financial_transactions WHERE trip_id=? ORDER BY occurred_on NULLS LAST,created_at,id",
  ).all(tripId);
  const splits = await db.prepare(
    "SELECT s.*,u.name member_name FROM expense_splits s LEFT JOIN users u ON u.id=s.member_user_id WHERE s.trip_id=? ORDER BY s.created_at,s.id",
  ).all(tripId);
  const financialTransactions = transactions.map((row) => ({
    id: row.id,
    sourceCollection: row.source_collection,
    sourceId: row.source_id,
    kind: row.kind,
    category: row.category,
    state: row.state,
    amount: { currency: row.currency, minorUnits: String(row.amount_minor) },
    payerId: row.payer_id,
    occurredOn: row.occurred_on ? String(row.occurred_on).slice(0, 10) : null,
    title: row.title,
    exchange: jsonObject(row.metadata).exchange || null,
  }));
  const expenseSplits = splits.map((row) => ({
    id: row.id,
    sourceCollection: row.source_collection,
    sourceId: row.source_id,
    memberUserId: row.member_user_id,
    participantName: row.member_name || row.participant_name,
    amount: { currency: row.currency, minorUnits: String(row.amount_minor) },
  }));
  const balances = new Map();
  for (const entry of financialTransactions.filter((entry) => entry.kind === "paid" && entry.payerId)) {
    const key = `${entry.payerId}:${entry.amount.currency}`;
    balances.set(key, (balances.get(key) || 0n) + BigInt(entry.amount.minorUnits));
  }
  for (const split of expenseSplits.filter((entry) => entry.memberUserId)) {
    const key = `${split.memberUserId}:${split.amount.currency}`;
    balances.set(key, (balances.get(key) || 0n) - BigInt(split.amount.minorUnits));
  }
  const settlementBalances = [...balances].map(([key, minorUnits]) => {
    const separator = key.lastIndexOf(":");
    return {
      memberUserId: key.slice(0, separator),
      currency: key.slice(separator + 1),
      minorUnits: minorUnits.toString(),
    };
  });
  const settlementTransfers = [];
  for (const currency of new Set(settlementBalances.map((balance) => balance.currency))) {
    const creditors = settlementBalances.filter((entry) => entry.currency === currency && BigInt(entry.minorUnits) > 0n)
      .map((entry) => ({ ...entry, remaining: BigInt(entry.minorUnits) }));
    const debtors = settlementBalances.filter((entry) => entry.currency === currency && BigInt(entry.minorUnits) < 0n)
      .map((entry) => ({ ...entry, remaining: -BigInt(entry.minorUnits) }));
    let creditorIndex = 0;
    let debtorIndex = 0;
    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];
      const amount = creditor.remaining < debtor.remaining ? creditor.remaining : debtor.remaining;
      settlementTransfers.push({
        fromUserId: debtor.memberUserId,
        toUserId: creditor.memberUserId,
        amount: { currency, minorUnits: amount.toString() },
      });
      creditor.remaining -= amount;
      debtor.remaining -= amount;
      if (creditor.remaining === 0n) creditorIndex++;
      if (debtor.remaining === 0n) debtorIndex++;
    }
  }
  return {
    financialTransactions,
    expenseSplits,
    settlementBalances,
    settlementTransfers,
  };
}
