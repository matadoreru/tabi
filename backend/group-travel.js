import { authorize } from "./authorization.js";
import { db, transaction } from "./database.js";
import { publish } from "./events.js";
import { body, HttpError, json, newId, now } from "./http.js";
import { PERMISSIONS } from "../src/permissions.js";
import { currencyDefinition, isSupportedCurrency } from "../src/currency.js";
import { decimalToMinor } from "../src/money.js";

function participant(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind,
    active: row.active,
    version: row.version,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listParticipants(tripId) {
  return (await db.prepare(
    "SELECT * FROM trip_participants WHERE trip_id=? ORDER BY active DESC,kind,name",
  ).all(tripId)).map(participant);
}

export async function ensureMemberParticipant(tripId, userId, name, createdBy = null) {
  const existing = await db.prepare("SELECT * FROM trip_participants WHERE trip_id=? AND user_id=?").get(
    tripId,
    userId,
  );
  if (existing) {
    await db.prepare("UPDATE trip_participants SET name=?,active=TRUE,updated_at=? WHERE id=?").run(
      name,
      now(),
      existing.id,
    );
    return existing.id;
  }
  const id = newId("par");
  const timestamp = now();
  await db.prepare(
    "INSERT INTO trip_participants(id,trip_id,user_id,name,kind,active,version,created_at,updated_at,created_by) VALUES (?,?,?,?, 'member',TRUE,1,?,?,?)",
  ).run(id, tripId, userId, name, timestamp, timestamp, createdBy);
  return id;
}

export async function participantRoutes(request, user, tripId, id = "") {
  await authorize(user.id, tripId, request.method === "GET" ? PERMISSIONS.TRIP_VIEW : PERMISSIONS.TRIP_EDIT);
  if (request.method === "GET" && !id) return json({ participants: await listParticipants(tripId) });
  if (request.method === "POST" && !id) {
    const input = await body(request);
    const name = String(input.name || "").trim();
    if (!name || name.length > 80) throw new HttpError(422, "INVALID_PARTICIPANT", "Indica un nombre válido.");
    const timestamp = now();
    const participantId = newId("par");
    await transaction(async () => {
      await db.prepare(
        "INSERT INTO trip_participants(id,trip_id,name,kind,active,version,created_at,updated_at,created_by) VALUES (?,?,?,'guest',TRUE,1,?,?,?)",
      ).run(participantId, tripId, name, timestamp, timestamp, user.id);
      await recordChange(tripId, user, "participant.created", "participant", participantId, { name });
    });
    publishDomainChange(tripId, user, "participant.created", participantId);
    return json({
      participant: participant(await db.prepare("SELECT * FROM trip_participants WHERE id=?").get(participantId)),
    }, 201);
  }
  const current = id && await db.prepare("SELECT * FROM trip_participants WHERE id=? AND trip_id=?").get(id, tripId);
  if (!current) throw new HttpError(404, "PARTICIPANT_NOT_FOUND", "Participante no encontrado.");
  if (request.method === "PATCH") {
    const input = await body(request);
    if (Number(input.version) !== current.version) {
      throw new HttpError(409, "VERSION_CONFLICT", "El participante cambió.");
    }
    const name = String(input.name ?? current.name).trim();
    if (!name || name.length > 80) throw new HttpError(422, "INVALID_PARTICIPANT", "Indica un nombre válido.");
    await transaction(async () => {
      const result = await db.prepare(
        "UPDATE trip_participants SET name=?,active=?,version=version+1,updated_at=? WHERE id=? AND trip_id=? AND version=?",
      ).run(
        name,
        typeof input.active === "boolean" ? input.active : current.active,
        now(),
        id,
        tripId,
        current.version,
      );
      if (!result.changes) throw new HttpError(409, "VERSION_CONFLICT", "El participante cambió.");
      await recordChange(tripId, user, "participant.updated", "participant", id, { name });
    });
    publishDomainChange(tripId, user, "participant.updated", id);
    return json({ participant: participant(await db.prepare("SELECT * FROM trip_participants WHERE id=?").get(id)) });
  }
  if (request.method === "DELETE") {
    const input = await body(request);
    if (Number(input.version) !== current.version) {
      throw new HttpError(409, "VERSION_CONFLICT", "El participante cambió.");
    }
    if (current.kind === "member") {
      throw new HttpError(422, "MEMBER_PARTICIPANT", "Desactiva al participante o elimina primero al miembro.");
    }
    await transaction(async () => {
      const result = await db.prepare(
        "UPDATE trip_participants SET active=FALSE,version=version+1,updated_at=? WHERE id=? AND version=?",
      ).run(
        now(),
        id,
        current.version,
      );
      if (!result.changes) throw new HttpError(409, "VERSION_CONFLICT", "El participante cambió.");
      await recordChange(tripId, user, "participant.deactivated", "participant", id, { name: current.name });
    });
    publishDomainChange(tripId, user, "participant.deactivated", id);
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

function settlement(row) {
  return {
    id: row.id,
    fromParticipantId: row.from_participant_id,
    toParticipantId: row.to_participant_id,
    amount: {
      currency: row.currency,
      minorUnits: String(row.amount_minor),
      scale: currencyDefinition(row.currency).digits,
    },
    paidOn: String(row.paid_on).slice(0, 10),
    note: row.note,
    status: row.status,
    version: row.version,
    createdAt: String(row.created_at),
  };
}

export async function listSettlementPayments(tripId) {
  return (await db.prepare("SELECT * FROM settlement_payments WHERE trip_id=? ORDER BY paid_on DESC,created_at DESC")
    .all(
      tripId,
    )).map(settlement);
}

export async function settlementRoutes(request, user, tripId, id = "") {
  await authorize(user.id, tripId, request.method === "GET" ? PERMISSIONS.TRIP_VIEW : PERMISSIONS.BUDGET_EDIT);
  if (request.method === "GET" && !id) return json({ settlementPayments: await listSettlementPayments(tripId) });
  if (request.method === "POST" && !id) {
    const input = await body(request);
    if (!isSupportedCurrency(input.currency)) throw new HttpError(422, "INVALID_CURRENCY", "Moneda no válida.");
    if (input.fromParticipantId === input.toParticipantId) {
      throw new HttpError(422, "INVALID_SETTLEMENT", "El origen y el destino deben ser diferentes.");
    }
    const participants = await db.prepare(
      "SELECT id FROM trip_participants WHERE trip_id=? AND id IN (?,?)",
    ).all(tripId, input.fromParticipantId, input.toParticipantId);
    if (participants.length !== 2) throw new HttpError(422, "INVALID_PARTICIPANT", "Participante no válido.");
    let amountMinor;
    try {
      amountMinor = decimalToMinor(input.amount, input.currency);
    } catch {
      throw new HttpError(422, "INVALID_AMOUNT", "Importe no válido.");
    }
    if (BigInt(amountMinor) <= 0n) throw new HttpError(422, "INVALID_AMOUNT", "El importe debe ser mayor que cero.");
    if (input.paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) {
      throw new HttpError(422, "INVALID_DATE", "La fecha del pago no es válida.");
    }
    const timestamp = now();
    const settlementId = newId("set");
    await transaction(async () => {
      await db.prepare(
        "INSERT INTO settlement_payments(id,trip_id,from_participant_id,to_participant_id,amount_minor,currency,paid_on,note,status,version,created_at,updated_at,created_by) VALUES (?,?,?,?,?,?,?,?, 'confirmed',1,?,?,?)",
      ).run(
        settlementId,
        tripId,
        input.fromParticipantId,
        input.toParticipantId,
        amountMinor,
        input.currency,
        input.paidOn || now().slice(0, 10),
        String(input.note || "").slice(0, 500),
        timestamp,
        timestamp,
        user.id,
      );
      await recordChange(tripId, user, "settlement.created", "settlement", settlementId, {
        fromParticipantId: input.fromParticipantId,
        toParticipantId: input.toParticipantId,
        amountMinor,
        currency: input.currency,
      });
    });
    publishDomainChange(tripId, user, "settlement.created", settlementId);
    return json({
      settlement: settlement(await db.prepare("SELECT * FROM settlement_payments WHERE id=?").get(settlementId)),
    }, 201);
  }
  const current = id && await db.prepare("SELECT * FROM settlement_payments WHERE id=? AND trip_id=?").get(id, tripId);
  if (!current) throw new HttpError(404, "SETTLEMENT_NOT_FOUND", "Liquidación no encontrada.");
  if (request.method === "PATCH") {
    const input = await body(request);
    if (Number(input.version) !== current.version) {
      throw new HttpError(409, "VERSION_CONFLICT", "La liquidación cambió.");
    }
    const status = input.status === "confirmed" ? "confirmed" : "voided";
    await transaction(async () => {
      const result = await db.prepare(
        "UPDATE settlement_payments SET status=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      ).run(
        status,
        now(),
        id,
        current.version,
      );
      if (!result.changes) throw new HttpError(409, "VERSION_CONFLICT", "La liquidación cambió.");
      await recordChange(tripId, user, "settlement.updated", "settlement", id, { status });
    });
    publishDomainChange(tripId, user, "settlement.updated", id);
    return json({ settlement: settlement(await db.prepare("SELECT * FROM settlement_payments WHERE id=?").get(id)) });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

export async function proposalVoteRoute(request, user, tripId, proposalId) {
  if (request.method !== "POST" || !proposalId) {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  }
  await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
  const input = await body(request);
  if (!["yes", "maybe", "no"].includes(input.choice)) {
    throw new HttpError(422, "INVALID_VOTE", "El voto no es válido.");
  }
  let updated;
  await transaction(async () => {
    const current = await db.prepare("SELECT * FROM proposals WHERE id=? AND trip_id=? FOR UPDATE").get(
      proposalId,
      tripId,
    );
    if (!current) throw new HttpError(404, "PROPOSAL_NOT_FOUND", "Propuesta no encontrada.");
    const data = typeof current.data === "string" ? JSON.parse(current.data) : current.data || {};
    const next = { ...data, votes: { ...(data.votes || {}), [user.id]: input.choice } };
    await db.prepare(
      "UPDATE proposals SET data=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND trip_id=?",
    ).run(next, now(), user.id, proposalId, tripId);
    await recordChange(tripId, user, "proposal.voted", "proposals", proposalId, { choice: input.choice });
    updated = await db.prepare("SELECT * FROM proposals WHERE id=?").get(proposalId);
  });
  const item = {
    ...(typeof updated.data === "string" ? JSON.parse(updated.data) : updated.data),
    id: updated.id,
    tripId: updated.trip_id,
    version: updated.version,
    createdAt: String(updated.created_at),
    updatedAt: String(updated.updated_at),
    createdBy: updated.created_by,
    updatedBy: updated.updated_by,
  };
  publish(tripId, {
    action: "proposal.voted",
    collection: "proposals",
    entityId: proposalId,
    item,
    user: { id: user.id, name: user.name },
    at: now(),
  });
  return json({ item });
}

export async function listNotifications(tripId, userId) {
  const rows = await db.prepare(
    `SELECT l.*,r.read_at,u.name user_name,u.avatar_url FROM trip_activity_logs l
       LEFT JOIN notification_reads r ON r.trip_id=l.trip_id AND r.user_id=? AND r.notification_key=l.id
       LEFT JOIN users u ON u.id=l.user_id
       WHERE l.trip_id=? AND (l.user_id IS DISTINCT FROM ?) ORDER BY l.created_at DESC LIMIT 100`,
  ).all(userId, tripId, userId);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata || {},
    userName: row.user_name || "Usuario eliminado",
    avatarUrl: row.avatar_url || "",
    createdAt: String(row.created_at),
    read: Boolean(row.read_at),
  }));
}

export async function notificationRoutes(request, user, tripId) {
  await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
  if (request.method === "GET") return json({ notifications: await listNotifications(tripId, user.id) });
  if (request.method === "POST") {
    const input = await body(request);
    const ids = Array.isArray(input.ids)
      ? input.ids.filter((id) => typeof id === "string" && /^log_[A-Za-z0-9]+$/.test(id)).slice(0, 100)
      : [];
    for (const id of ids) {
      await db.prepare(
        `INSERT INTO notification_reads(trip_id,user_id,notification_key,read_at)
         SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM trip_activity_logs WHERE id=? AND trip_id=?)
         ON CONFLICT(trip_id,user_id,notification_key) DO UPDATE SET read_at=excluded.read_at`,
      ).run(tripId, user.id, id, now(), id, tripId);
    }
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function recordChange(tripId, user, action, entityType, entityId, metadata = {}) {
  await db.prepare(
    "INSERT INTO trip_activity_logs(id,trip_id,user_id,action,entity_type,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(newId("log"), tripId, user.id, action, entityType, entityId, metadata, now());
}

function publishDomainChange(tripId, user, action, entityId) {
  publish(tripId, {
    action,
    collection: "",
    entityId,
    user: { id: user.id, name: user.name },
    at: now(),
  });
}
