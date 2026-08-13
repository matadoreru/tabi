import { db, entityTable, transaction } from "./database.js";
import { newId, now } from "./http.js";
import { entityFinancialTransactions, FINANCIAL_COLLECTIONS, simplifySettlementBalances } from "../src/finance.js";
import { allocateMoney, monetaryField } from "../src/money.js";

const PROJECTION_VERSION = 2;

function jsonObject(value) {
  return typeof value === "string" ? JSON.parse(value) : value || {};
}

function readSource(row) {
  return { ...jsonObject(row.data), id: row.id };
}

export async function syncFinancialSource(tripId, collection, item, tripCurrency, timestamp = now()) {
  if (!FINANCIAL_COLLECTIONS.includes(collection)) return;
  const payerParticipantId = item.paidByParticipantId ||
    (item.paidByUserId
      ? (await db.prepare("SELECT id FROM trip_participants WHERE trip_id=? AND user_id=?").get(
        tripId,
        item.paidByUserId,
      ))?.id
      : null);
  await db.prepare("DELETE FROM financial_transactions WHERE trip_id=? AND source_collection=? AND source_id=?")
    .run(tripId, collection, item.id);
  for (const entry of entityFinancialTransactions(collection, item, tripCurrency)) {
    await db.prepare(
      `INSERT INTO financial_transactions(
        id,trip_id,source_collection,source_id,kind,category,state,amount_minor,currency,payer_id,payer_participant_id,occurred_on,title,metadata,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      payerParticipantId,
      entry.occurredOn,
      entry.title,
      {
        ...(entry.exchange ? { exchange: entry.exchange } : {}),
        ...(item.recurrenceGroupId
          ? {
            recurrenceGroupId: item.recurrenceGroupId,
            recurrenceIndex: Number(item.recurrenceIndex || 1),
            recurrenceCount: Number(item.recurrenceCount || 1),
          }
          : {}),
      },
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
    ? item.splits.filter((split) => split?.participantId || split?.memberUserId || split?.participantName)
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
    const participantId = split.participantId ||
      (split.memberUserId
        ? (await db.prepare("SELECT id FROM trip_participants WHERE trip_id=? AND user_id=?").get(
          tripId,
          split.memberUserId,
        ))?.id
        : null);
    await db.prepare(
      `INSERT INTO expense_splits(
        id,trip_id,source_collection,source_id,member_user_id,participant_id,participant_name,amount_minor,currency,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      newId("spl"),
      tripId,
      collection,
      item.id,
      split.memberUserId || null,
      participantId,
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
    "SELECT s.*,u.name member_name,p.name participant_display_name FROM expense_splits s LEFT JOIN users u ON u.id=s.member_user_id LEFT JOIN trip_participants p ON p.id=s.participant_id WHERE s.trip_id=? ORDER BY s.created_at,s.id",
  ).all(tripId);
  const participants = await db.prepare("SELECT id,user_id,name FROM trip_participants WHERE trip_id=?").all(tripId);
  const participantById = new Map(participants.map((item) => [item.id, item]));
  const payments = await db.prepare(
    "SELECT * FROM settlement_payments WHERE trip_id=? AND status='confirmed' ORDER BY paid_on,created_at",
  ).all(tripId);
  const financialTransactions = transactions.map((row) => {
    const metadata = jsonObject(row.metadata);
    return {
      id: row.id,
      sourceCollection: row.source_collection,
      sourceId: row.source_id,
      kind: row.kind,
      category: row.category,
      state: row.state,
      amount: { currency: row.currency, minorUnits: String(row.amount_minor) },
      payerId: row.payer_id,
      payerParticipantId: row.payer_participant_id,
      occurredOn: row.occurred_on ? String(row.occurred_on).slice(0, 10) : null,
      title: row.title,
      exchange: metadata.exchange || null,
      recurrenceGroupId: metadata.recurrenceGroupId || "",
      recurrenceIndex: Number(metadata.recurrenceIndex || 0),
      recurrenceCount: Number(metadata.recurrenceCount || 0),
    };
  });
  const expenseSplits = splits.map((row) => ({
    id: row.id,
    sourceCollection: row.source_collection,
    sourceId: row.source_id,
    memberUserId: row.member_user_id,
    participantId: row.participant_id,
    participantName: row.participant_display_name || row.member_name || row.participant_name,
    amount: { currency: row.currency, minorUnits: String(row.amount_minor) },
  }));
  const balances = new Map();
  for (const entry of financialTransactions.filter((entry) => entry.kind === "paid" && entry.payerParticipantId)) {
    const key = `${entry.payerParticipantId}:${entry.amount.currency}`;
    balances.set(key, (balances.get(key) || 0n) + BigInt(entry.amount.minorUnits));
  }
  for (const split of expenseSplits.filter((entry) => entry.participantId)) {
    const key = `${split.participantId}:${split.amount.currency}`;
    balances.set(key, (balances.get(key) || 0n) - BigInt(split.amount.minorUnits));
  }
  for (const payment of payments) {
    const fromKey = `${payment.from_participant_id}:${payment.currency}`;
    const toKey = `${payment.to_participant_id}:${payment.currency}`;
    const amount = BigInt(payment.amount_minor);
    balances.set(fromKey, (balances.get(fromKey) || 0n) + amount);
    balances.set(toKey, (balances.get(toKey) || 0n) - amount);
  }
  const settlementBalances = [...balances].map(([key, minorUnits]) => {
    const separator = key.lastIndexOf(":");
    return {
      participantId: key.slice(0, separator),
      memberUserId: participantById.get(key.slice(0, separator))?.user_id || null,
      participantName: participantById.get(key.slice(0, separator))?.name || "Participante",
      currency: key.slice(separator + 1),
      minorUnits: minorUnits.toString(),
    };
  });
  const settlementTransfers = simplifySettlementBalances(settlementBalances).map((transfer) => ({
    ...transfer,
    fromUserId: participantById.get(transfer.fromParticipantId)?.user_id || null,
    toUserId: participantById.get(transfer.toParticipantId)?.user_id || null,
  }));
  return {
    financialTransactions,
    expenseSplits,
    settlementBalances,
    settlementTransfers,
  };
}
