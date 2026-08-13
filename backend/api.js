import { db, entityTable, transaction } from "./database.js";
import { currentUser, publicUser } from "./auth.js";
import { authRoutes } from "./auth-routes.js";
import { assertResourceInTrip, authorize, membership } from "./authorization.js";
import { randomToken, sha256 } from "./crypto.js";
import { CONFIG, ENTITY_TABLES } from "./config.js";
import { body, HttpError, json, newId, now, validateMutationOrigin } from "./http.js";
import { eventStream, publish } from "./events.js";
import { getExchangeRate } from "./exchange-rates.js";
import { googleMapsUrl, resolveGoogleMapsUrl } from "./google-maps.js";
import { ensureFinancialProjection, financialState, removeFinancialSource, syncFinancialSource } from "./finance.js";
import { extractMediaAssets, mediaResponse, removeOwnedMedia } from "./media.js";
import { PERMISSIONS, permissionsForRole } from "../src/permissions.js";
import { findPlaceDuplicate, inspirationLink } from "../src/domain.js";
import { alternateCurrency, isSupportedCurrency } from "../src/currency.js";
import { ENTITY_CONTRACTS, entityContractIssues, MONEY_FIELDS } from "../src/contracts.js";
import { attachExactMoney, createMoney, monetaryField } from "../src/money.js";
import { attachTemporalInstants, isValidTimeZone } from "../src/time.js";
import { commentRoutes, routeEstimateRoutes } from "./collaboration.js";
import { prometheusMetrics, uptimeSeconds } from "./metrics.js";
import { addIsoDays, duplicateOptions, resetEntityProgress, shiftEntityDates } from "../src/templates.js";
import { weatherRoute } from "./weather.js";
import {
  ensureMemberParticipant,
  listNotifications,
  listParticipants,
  listSettlementPayments,
  notificationRoutes,
  participantRoutes,
  proposalVoteRoute,
  settlementRoutes,
} from "./group-travel.js";

const editPermission = (collection) =>
  collection === "expenses" || collection === "funds" ? PERMISSIONS.BUDGET_EDIT : PERMISSIONS.TRIP_EDIT;
const userSelect = "u.id,u.name,u.username,u.email,u.avatar_url,u.created_at";
const PORTABLE_COLLECTIONS = new Set(Object.keys(ENTITY_TABLES).filter((name) => name !== "locationShares"));
const OPTIONAL_ARCHIVE_COLLECTIONS = new Set([
  "notes",
  "reminders",
  "proposals",
  "availabilities",
  "journalEntries",
  "emergencyContacts",
  "locationShares",
]);

export async function api(request, pathname) {
  validateMutationOrigin(request);
  const parts = pathname.split("/").filter(Boolean).slice(1);

  if (parts[0] === "health" && request.method === "GET") {
    await db.prepare("SELECT 1").get();
    const migration = await db.prepare("SELECT COALESCE(MAX(version),0) version FROM schema_migrations").get();
    return json({
      status: "ok",
      database: "postgresql",
      schemaVersion: Number(migration.version),
      uptimeSeconds: uptimeSeconds(),
      commit: CONFIG.commitSha || null,
    });
  }
  if (parts[0] === "metrics" && request.method === "GET") {
    if (!CONFIG.metricsToken || request.headers.get("authorization") !== `Bearer ${CONFIG.metricsToken}`) {
      throw new HttpError(404, "NOT_FOUND", "Ruta no encontrada.");
    }
    return new Response(prometheusMetrics(), {
      headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (parts[0] === "version" && request.method === "GET") {
    return json({
      commit: CONFIG.commitSha || null,
      shortCommit: CONFIG.commitSha ? CONFIG.commitSha.slice(0, 8) : null,
    });
  }
  if (parts[0] === "auth") return authRoutes(request, parts.slice(1));
  if (parts[0] === "invite") return invitePublicRoutes(request, parts.slice(1));

  const user = await currentUser(request);
  if (parts[0] === "me" && request.method === "GET") return json({ user });
  if (parts[0] === "media" && parts[1] && request.method === "GET") return await mediaResponse(user.id, parts[1]);
  if (parts[0] === "config" && parts[1] === "maps" && request.method === "GET") {
    return json({
      enabled: Boolean(CONFIG.googleMapsApiKey && CONFIG.googleMapsMapId),
      apiKey: CONFIG.googleMapsApiKey,
      mapId: CONFIG.googleMapsMapId,
    });
  }
  if (parts[0] === "maps" && parts[1] === "resolve" && request.method === "POST") {
    const input = await body(request);
    return json({ url: await resolveGoogleMapsUrl(input.url) });
  }
  if (parts[0] === "exchange-rates") {
    if (request.method === "GET") {
      const url = new URL(request.url);
      return json(await getExchangeRate(url.searchParams.get("base"), url.searchParams.get("quote")));
    }
    if (request.method === "POST") {
      const input = await body(request);
      return json(await getExchangeRate(input.base, input.quote, { force: Boolean(input.force) }));
    }
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  }
  if (parts[0] === "weather") return weatherRoute(request);
  if (parts[0] !== "trips") throw new HttpError(404, "NOT_FOUND", "Ruta no encontrada.");
  if (parts.length === 1) return tripCollectionRoutes(request, user);

  const tripId = parts[1];
  if (parts.length === 2) return tripRoutes(request, user, tripId);
  const resource = parts[2];
  if (resource === "bootstrap") return bootstrap(request, user, tripId);
  if (resource === "events") {
    await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    return eventStream(tripId, request.signal);
  }
  if (resource === "finance" && request.method === "GET") {
    await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    const currency = await tripCurrency(tripId);
    await ensureFinancialProjection(tripId, currency);
    return json(await financialState(tripId));
  }
  if (resource === "comments") return commentRoutes(request, user, tripId, parts[3]);
  if (resource === "participants") return participantRoutes(request, user, tripId, parts[3]);
  if (resource === "settlements") return settlementRoutes(request, user, tripId, parts[3]);
  if (resource === "notifications") return notificationRoutes(request, user, tripId);
  if (resource === "proposals" && parts[4] === "vote") {
    return proposalVoteRoute(request, user, tripId, parts[3]);
  }
  if (resource === "history") return historyRoutes(request, user, tripId, parts[3]);
  if (resource === "route-estimates") return routeEstimateRoutes(request, user, tripId);
  if (resource === "members") return memberRoutes(request, user, tripId, parts.slice(3));
  if (resource === "invitations") return invitationRoutes(request, user, tripId, parts.slice(3));
  if (resource === "duplicate") return duplicateTrip(request, user, tripId);
  if (resource === "duplicate-day") return duplicateDay(request, user, tripId);
  if (resource === "leave") return leaveTrip(request, user, tripId);
  if (resource === "transfer") return transferTrip(request, user, tripId);
  if (resource === "archive") return tripArchiveRoutes(request, user, tripId);
  if (resource === "import") return importTripData(request, user, tripId);
  if (ENTITY_TABLES[resource]) return entityRoutes(request, user, tripId, resource, parts[3]);
  throw new HttpError(404, "NOT_FOUND", "Ruta no encontrada.");
}

async function tripCollectionRoutes(request, user) {
  if (request.method === "GET") {
    const rows = await db.prepare(
      `SELECT t.*,tm.role,tm.joined_at,(SELECT COUNT(*) FROM trip_members x WHERE x.trip_id=t.id) AS member_count FROM trips t JOIN trip_members tm ON tm.trip_id=t.id WHERE tm.user_id=? ORDER BY t.start_date DESC`,
    ).all(user.id);
    return json({ trips: rows.map(readTrip) });
  }
  if (request.method === "POST") {
    const input = await body(request);
    validateTrip(input);
    const extra = tripExtra(input);
    const timestamp = now();
    const id = newId("trip");
    await transaction(async () => {
      await db.prepare(
        "INSERT INTO trips(id,name,emoji,country,start_date,end_date,travelers,budget,currency,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
        .run(
          id,
          input.name.trim(),
          input.emoji || "✈️",
          input.country || "",
          input.startDate,
          input.endDate,
          Number(input.travelers || 1),
          Number(input.budget || 0),
          input.currency || "JPY",
          extra,
          1,
          timestamp,
          timestamp,
          user.id,
          user.id,
        );
      await db.prepare(
        "INSERT INTO trip_members(trip_id,user_id,role,joined_at,invited_by) VALUES (?,?,'owner',?,NULL)",
      ).run(
        id,
        user.id,
        timestamp,
      );
      await ensureMemberParticipant(id, user.id, user.name, user.id);
      await audit(id, user.id, "trip.created", "trip", id, { name: input.name });
    });
    return json({
      trip: readTrip(await db.prepare("SELECT t.*,'owner' role,1 member_count FROM trips t WHERE id=?").get(id)),
    }, 201);
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function tripRoutes(request, user, tripId) {
  if (request.method === "GET") {
    const member = await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    return json({
      trip: readTrip(await db.prepare("SELECT * FROM trips WHERE id=?").get(tripId)),
      membership: readMembership(member),
    });
  }
  if (request.method === "PATCH") {
    await authorize(user.id, tripId, PERMISSIONS.TRIP_EDIT);
    const input = await body(request);
    const current = await db.prepare("SELECT * FROM trips WHERE id=?").get(tripId);
    if (Number(input.version) !== current.version) conflict(current.version);
    const merged = { ...readTrip(current), ...input };
    validateTrip(merged);
    const extra = tripExtra(merged, jsonObject(current.data));
    const timestamp = now();
    const result = await db.prepare(
      "UPDATE trips SET name=?,emoji=?,country=?,start_date=?,end_date=?,travelers=?,budget=?,currency=?,data=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?",
    )
      .run(
        merged.name,
        merged.emoji,
        merged.country,
        merged.startDate,
        merged.endDate,
        Number(merged.travelers),
        Number(merged.budget),
        merged.currency,
        extra,
        timestamp,
        user.id,
        tripId,
        current.version,
      );
    if (!result.changes) conflict(current.version + 1);
    await audit(tripId, user.id, "trip.updated", "trip", tripId, diff(readTrip(current), merged));
    emit(tripId, user, "trip.updated", "trips", tripId);
    return json({ trip: readTrip(await db.prepare("SELECT * FROM trips WHERE id=?").get(tripId)) });
  }
  if (request.method === "DELETE") {
    await authorize(user.id, tripId, PERMISSIONS.TRIP_DELETE);
    await db.prepare("DELETE FROM trips WHERE id=?").run(tripId);
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function bootstrap(request, user, tripId) {
  if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  const member = await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
  const trip = readTrip(await db.prepare("SELECT * FROM trips WHERE id=?").get(tripId));
  const locationRows = await db.prepare("SELECT id,data FROM location_shares WHERE trip_id=?").all(tripId);
  for (const row of locationRows) {
    const expiration = Date.parse(jsonObject(row.data).expiresAt || "");
    if (!Number.isFinite(expiration) || expiration <= Date.now()) {
      await db.prepare("DELETE FROM location_shares WHERE id=? AND trip_id=?").run(row.id, tripId);
    }
  }
  await ensureFinancialProjection(tripId, trip.currency);
  const collections = Object.fromEntries(
    await Promise.all(
      Object.keys(ENTITY_TABLES).map(async (
        name,
      ) => [
        name,
        (await db.prepare(`SELECT * FROM ${entityTable(name)} WHERE trip_id=? ORDER BY created_at`).all(tripId)).map(
          readEntity,
        ).filter((item) => name !== "locationShares" || Date.parse(item.expiresAt) > Date.now()),
      ]),
    ),
  );
  const members = await listMembers(tripId);
  const logs = await listLogs(tripId);
  const invitations = permissionsForRole(member.role).includes(PERMISSIONS.MEMBER_INVITE)
    ? await listInvitations(tripId)
    : [];
  const finance = await financialState(tripId);
  const participants = await listParticipants(tripId);
  const settlementPayments = await listSettlementPayments(tripId);
  const notifications = await listNotifications(tripId, user.id);
  return json({
    trip,
    membership: readMembership(member),
    permissions: permissionsForRole(member.role),
    members,
    logs,
    invitations,
    participants,
    settlementPayments,
    notifications,
    ...finance,
    ...collections,
  });
}

async function entityRoutes(request, user, tripId, collection, id) {
  const table = entityTable(collection);
  if (request.method === "GET") {
    await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    return json({ items: (await db.prepare(`SELECT * FROM ${table} WHERE trip_id=?`).all(tripId)).map(readEntity) });
  }
  await authorize(user.id, tripId, editPermission(collection));
  const input = await body(request);
  const timestamp = now();
  if (request.method === "POST" && !id) {
    const entityId = newId(collection.slice(0, 3));
    let data = cleanEntity(input);
    data = attachTemporalInstants(collection, data, await tripTimeZone(tripId));
    await attachEntityMoney(tripId, collection, data);
    validateEntity(collection, data);
    await assertFinancialMembers(tripId, data, collection);
    await attachExchangeSnapshot(tripId, data, input);
    if (collection === "activities") await assertActivityReference(tripId, data);
    if (collection === "reservations") await assertReservationReference(tripId, data);
    if (collection === "places" && googleMapsUrl(data.link)) data.link = await resolveGoogleMapsUrl(data.link);
    if (collection === "inspirations") await assertUniqueInspiration(tripId, data.url);
    if (collection === "places") await assertUniquePlace(tripId, data);
    const title = entityTitle(collection, data);
    await transaction(async () => {
      await extractMediaAssets(tripId, collection, entityId, data, user.id);
      await db.prepare(
        `INSERT INTO ${table}(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
      ).run(entityId, tripId, data, 1, timestamp, timestamp, user.id, user.id);
      await syncFinancialSource(tripId, collection, { ...data, id: entityId }, await tripCurrency(tripId), timestamp);
      await audit(tripId, user.id, "entity.created", collection, entityId, { title });
    });
    const item = readEntity(await db.prepare(`SELECT * FROM ${table} WHERE id=? AND trip_id=?`).get(entityId, tripId));
    emit(tripId, user, "entity.created", collection, entityId, item);
    return json({ item, ...await financialState(tripId) }, 201);
  }
  const current = await assertResourceInTrip(table, id, tripId);
  if (request.method === "PATCH") {
    if (Number(input.version) !== current.version) conflict(current.version);
    const before = readEntity(current);
    let data = { ...cleanEntity(before), ...cleanEntity(input) };
    delete data.id;
    delete data.tripId;
    data = attachTemporalInstants(collection, data, await tripTimeZone(tripId));
    await attachEntityMoney(tripId, collection, data);
    validateEntity(collection, data);
    await assertFinancialMembers(tripId, data, collection);
    await attachExchangeSnapshot(tripId, data, input);
    if (collection === "activities") await assertActivityReference(tripId, data);
    if (collection === "reservations") await assertReservationReference(tripId, data);
    if (collection === "places" && googleMapsUrl(data.link)) data.link = await resolveGoogleMapsUrl(data.link);
    if (collection === "inspirations") await assertUniqueInspiration(tripId, data.url, id);
    if (collection === "places") await assertUniquePlace(tripId, data, id);
    await transaction(async () => {
      await extractMediaAssets(tripId, collection, id, data, user.id);
      const result = await db.prepare(
        `UPDATE ${table} SET data=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND trip_id=? AND version=?`,
      ).run(data, timestamp, user.id, id, tripId, current.version);
      if (!result.changes) conflict(current.version + 1);
      await syncFinancialSource(tripId, collection, { ...data, id }, await tripCurrency(tripId), timestamp);
      await audit(tripId, user.id, "entity.updated", collection, id, {
        title: entityTitle(collection, data),
        changes: diff(before, data),
        previous: cleanEntity(before),
      });
    });
    const item = readEntity(await db.prepare(`SELECT * FROM ${table} WHERE id=? AND trip_id=?`).get(id, tripId));
    emit(tripId, user, "entity.updated", collection, id, item);
    return json({ item, ...await financialState(tripId) });
  }
  if (request.method === "DELETE") {
    if (Number(input.version) !== current.version) conflict(current.version);
    await transaction(async () => {
      await db.prepare("DELETE FROM entity_comments WHERE trip_id=? AND entity_collection=? AND entity_id=?").run(
        tripId,
        collection,
        id,
      );
      await removeFinancialSource(tripId, collection, id);
      await removeOwnedMedia(tripId, collection, id);
      const result = await db.prepare(`DELETE FROM ${table} WHERE id=? AND trip_id=? AND version=?`).run(
        id,
        tripId,
        current.version,
      );
      if (!result.changes) conflict(current.version + 1);
      await audit(tripId, user.id, "entity.deleted", collection, id, {
        title: entityTitle(collection, readEntity(current)),
        previous: cleanEntity(readEntity(current)),
      });
    });
    emit(tripId, user, "entity.deleted", collection, id, null);
    return json({ ok: true, ...await financialState(tripId) });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function historyRoutes(request, user, tripId, logId) {
  if (request.method !== "POST" || !logId) throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  await authorize(user.id, tripId, PERMISSIONS.TRIP_EDIT);
  const log = await db.prepare("SELECT * FROM trip_activity_logs WHERE id=? AND trip_id=?").get(logId, tripId);
  const metadata = jsonObject(log?.metadata);
  if (!log || !ENTITY_TABLES[log.entity_type] || !metadata.previous) {
    throw new HttpError(422, "HISTORY_NOT_RESTORABLE", "Esta entrada no contiene una versión restaurable.");
  }
  const table = entityTable(log.entity_type);
  const current = await db.prepare(`SELECT * FROM ${table} WHERE id=? AND trip_id=?`).get(log.entity_id, tripId);
  const timestamp = now();
  const data = cleanEntity(metadata.previous);
  await transaction(async () => {
    if (current) {
      await db.prepare(
        `UPDATE ${table} SET data=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND trip_id=?`,
      ).run(
        data,
        timestamp,
        user.id,
        log.entity_id,
        tripId,
      );
    } else {
      await db.prepare(
        `INSERT INTO ${table}(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,1,?,?,?,?)`,
      ).run(log.entity_id, tripId, data, timestamp, timestamp, user.id, user.id);
    }
    await syncFinancialSource(
      tripId,
      log.entity_type,
      { ...data, id: log.entity_id },
      await tripCurrency(tripId),
      timestamp,
    );
    await audit(tripId, user.id, "entity.restored", log.entity_type, log.entity_id, {
      title: entityTitle(log.entity_type, data),
      sourceLogId: logId,
    });
  });
  const item = readEntity(
    await db.prepare(`SELECT * FROM ${table} WHERE id=? AND trip_id=?`).get(log.entity_id, tripId),
  );
  emit(tripId, user, "entity.restored", log.entity_type, log.entity_id, item);
  return json({ item, ...await financialState(tripId) });
}

async function memberRoutes(request, user, tripId, parts) {
  if (request.method === "GET" && !parts[0]) {
    await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    return json({ members: await listMembers(tripId) });
  }
  const targetId = parts[0];
  if (!targetId) throw new HttpError(404, "NOT_FOUND", "Miembro no encontrado.");
  if (request.method === "PATCH") {
    await authorize(user.id, tripId, PERMISSIONS.MEMBER_CHANGE_ROLE);
    const input = await body(request);
    if (!["editor", "viewer"].includes(input.role)) throw new HttpError(422, "INVALID_ROLE", "Rol no válido.");
    const target = await membership(targetId, tripId);
    if (!target || target.role === "owner") {
      throw new HttpError(422, "OWNER_PROTECTED", "Transfiere la propiedad para cambiar al owner.");
    }
    await db.prepare("UPDATE trip_members SET role=? WHERE trip_id=? AND user_id=?").run(input.role, tripId, targetId);
    await audit(tripId, user.id, "member.role_changed", "member", targetId, { from: target.role, to: input.role });
    emit(tripId, user, "member.role_changed", "members", targetId);
    return json({ members: await listMembers(tripId) });
  }
  if (request.method === "DELETE") {
    await authorize(user.id, tripId, PERMISSIONS.MEMBER_REMOVE);
    const target = await membership(targetId, tripId);
    if (!target || target.role === "owner") {
      throw new HttpError(422, "OWNER_PROTECTED", "No se puede expulsar al propietario.");
    }
    await db.prepare("DELETE FROM trip_members WHERE trip_id=? AND user_id=?").run(tripId, targetId);
    await audit(tripId, user.id, "member.removed", "member", targetId, { name: target.name });
    emit(tripId, user, "member.removed", "members", targetId);
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function invitationRoutes(request, user, tripId, parts) {
  await authorize(user.id, tripId, PERMISSIONS.MEMBER_INVITE);
  if (request.method === "GET") return json({ invitations: await listInvitations(tripId) });
  if (request.method === "POST") {
    const input = await body(request);
    if (!["editor", "viewer"].includes(input.role)) {
      throw new HttpError(422, "INVALID_ROLE", "La invitación debe ser Editor o Viewer.");
    }
    const maxUses = Number(input.maxUses || 1);
    const expiryDays = Number(input.expiryDays || 7);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
      throw new HttpError(422, "INVALID_MAX_USES", "Los usos deben estar entre 1 y 100.");
    }
    if (expiryDays < 1 || expiryDays > 90) {
      throw new HttpError(422, "INVALID_EXPIRY", "La expiración debe estar entre 1 y 90 días.");
    }
    const token = randomToken(32);
    const id = newId("inv");
    const timestamp = now();
    const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString();
    await db.prepare(
      "INSERT INTO trip_invitations(id,trip_id,token_hash,role,created_by,created_at,expires_at,max_uses,uses,version) VALUES (?,?,?,?,?,?,?,?,0,1)",
    )
      .run(id, tripId, await sha256(token), input.role, user.id, timestamp, expiresAt, maxUses);
    await audit(tripId, user.id, "invitation.created", "invitation", id, { role: input.role, maxUses, expiresAt });
    return json({
      invitation: {
        ...readInvitation(
          await db.prepare(
            "SELECT i.*,u.name creator_name FROM trip_invitations i JOIN users u ON u.id=i.created_by WHERE i.id=?",
          ).get(id),
        ),
        token,
      },
    }, 201);
  }
  if (request.method === "DELETE" && parts[0]) {
    const invitation = await db.prepare("SELECT * FROM trip_invitations WHERE id=? AND trip_id=?").get(
      parts[0],
      tripId,
    );
    if (!invitation) throw new HttpError(404, "INVITATION_NOT_FOUND", "Invitación no encontrada.");
    await db.prepare("UPDATE trip_invitations SET revoked_at=?,version=version+1 WHERE id=? AND trip_id=?").run(
      now(),
      parts[0],
      tripId,
    );
    await audit(tripId, user.id, "invitation.revoked", "invitation", parts[0], {});
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function invitePublicRoutes(request, parts) {
  const token = parts[0];
  if (!token) throw new HttpError(404, "INVITATION_NOT_FOUND", "Invitación no encontrada.");
  const tokenHash = await sha256(token);
  if (request.method === "GET") {
    const row = await invitationByHash(tokenHash);
    validateInvitation(row);
    const user = await currentUser(request, false);
    return json({ invitation: publicInvitation(row), user });
  }
  if (request.method === "POST" && parts[1] === "accept") {
    const user = await currentUser(request);
    let tripId;
    await transaction(async () => {
      const row = await invitationByHash(tokenHash);
      validateInvitation(row);
      tripId = row.trip_id;
      const existing = await membership(user.id, tripId);
      if (!existing) {
        await db.prepare("INSERT INTO trip_members(trip_id,user_id,role,joined_at,invited_by) VALUES (?,?,?,?,?)").run(
          tripId,
          user.id,
          row.role,
          now(),
          row.created_by,
        );
        await ensureMemberParticipant(tripId, user.id, user.name, row.created_by);
      }
      const result = await db.prepare(
        "UPDATE trip_invitations SET uses=uses+1,version=version+1 WHERE id=? AND version=? AND revoked_at IS NULL AND uses<max_uses AND expires_at>?",
      ).run(row.id, row.version, now());
      if (!result.changes) throw new HttpError(409, "INVITATION_ALREADY_USED", "La invitación ya no está disponible.");
      await audit(tripId, user.id, "member.joined", "member", user.id, { role: row.role });
    });
    emit(tripId, user, "member.joined", "members", user.id);
    return json({ tripId });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function transferTrip(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  await authorize(user.id, tripId, PERMISSIONS.OWNER_TRANSFER);
  const input = await body(request);
  const target = await membership(input.userId, tripId);
  if (!target || target.role === "owner") {
    throw new HttpError(422, "INVALID_MEMBER", "Selecciona otro miembro del viaje.");
  }
  await transaction(async () => {
    await db.prepare("UPDATE trip_members SET role='editor' WHERE trip_id=? AND user_id=?").run(tripId, user.id);
    await db.prepare("UPDATE trip_members SET role='owner' WHERE trip_id=? AND user_id=?").run(tripId, input.userId);
    await audit(tripId, user.id, "owner.transferred", "member", input.userId, { from: user.id, to: input.userId });
  });
  emit(tripId, user, "owner.transferred", "members", input.userId);
  return json({ ok: true });
}

async function leaveTrip(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  const member = await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
  if (member.role === "owner") {
    throw new HttpError(422, "OWNER_CANNOT_LEAVE", "Transfiere la propiedad antes de abandonar el viaje.");
  }
  await db.prepare("DELETE FROM trip_members WHERE trip_id=? AND user_id=?").run(tripId, user.id);
  await audit(tripId, user.id, "member.left", "member", user.id, {});
  emit(tripId, user, "member.left", "members", user.id);
  return json({ ok: true });
}

async function duplicateTrip(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  await authorize(user.id, tripId, PERMISSIONS.TRIP_DUPLICATE);
  const input = await body(request);
  const source = await db.prepare("SELECT * FROM trips WHERE id=?").get(tripId);
  const sourceParticipants = await listParticipants(tripId);
  const options = duplicateOptions(input, dateOnly(source.start_date));
  if (!options.collections.size) {
    throw new HttpError(422, "EMPTY_DUPLICATE", "Selecciona al menos una sección para duplicar.");
  }
  const newTripId = newId("trip");
  const timestamp = now();
  const sourceRows = Object.fromEntries(
    await Promise.all(
      Object.entries(ENTITY_TABLES).map(async ([collection, table]) => [
        collection,
        options.collections.has(collection)
          ? await db.prepare(`SELECT * FROM ${table} WHERE trip_id=?`).all(tripId)
          : [],
      ]),
    ),
  );
  const idMaps = Object.fromEntries(
    Object.entries(sourceRows).map(([collection, rows]) => [
      collection,
      new Map(rows.map((row) => [row.id, newId(collection.slice(0, 3))])),
    ]),
  );
  const sourceEndDate = dateOnly(source.end_date);
  const targetStartDate = options.startDate;
  const targetEndDate = addIsoDays(sourceEndDate, options.shiftDays);
  const sourceExtra = jsonObject(source.data);
  const targetExtra = {
    ...sourceExtra,
    isTemplate: options.asTemplate,
    templateSourceId: tripId,
    templateCreatedAt: options.asTemplate ? timestamp : sourceExtra.templateCreatedAt || null,
  };
  await transaction(async () => {
    await db.prepare(
      "INSERT INTO trips(id,name,emoji,country,start_date,end_date,travelers,budget,currency,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .run(
        newTripId,
        options.name || `${source.name}${options.asTemplate ? " · plantilla" : " (copia)"}`,
        source.emoji,
        source.country,
        targetStartDate,
        targetEndDate,
        source.travelers,
        source.budget,
        source.currency,
        targetExtra,
        1,
        timestamp,
        timestamp,
        user.id,
        user.id,
      );
    await db.prepare("INSERT INTO trip_members(trip_id,user_id,role,joined_at) VALUES (?,?,'owner',?)").run(
      newTripId,
      user.id,
      timestamp,
    );
    const participantIdMap = new Map();
    const newOwnerParticipantId = await ensureMemberParticipant(newTripId, user.id, user.name, user.id);
    const sourceOwnerParticipant = sourceParticipants.find((participant) => participant.userId === user.id);
    if (sourceOwnerParticipant) participantIdMap.set(sourceOwnerParticipant.id, newOwnerParticipantId);
    for (
      const sourceParticipant of sourceParticipants.filter((participant) =>
        participant.id !== sourceOwnerParticipant?.id
      )
    ) {
      const participantId = newId("par");
      await db.prepare(
        "INSERT INTO trip_participants(id,trip_id,name,kind,active,version,created_at,updated_at,created_by) VALUES (?,?,?,'guest',TRUE,1,?,?,?)",
      ).run(participantId, newTripId, sourceParticipant.name, timestamp, timestamp, user.id);
      participantIdMap.set(sourceParticipant.id, participantId);
    }
    for (const [collection, table] of Object.entries(ENTITY_TABLES)) {
      for (const row of sourceRows[collection]) {
        const entityId = idMaps[collection].get(row.id);
        let data = shiftEntityDates(collection, jsonObject(row.data), options.shiftDays);
        if (options.resetProgress) data = resetEntityProgress(collection, data);
        if (collection === "activities") {
          for (const [field, target] of [["placeId", "places"], ["stayId", "stays"], ["transportId", "transports"]]) {
            if (data[field]) {
              data[field] = idMaps[target].get(data[field]) || "";
              if (!data[field]) data.activityKind = "General";
            }
          }
        }
        if (collection === "reservations" && data.linkedCollection && data.linkedEntityId) {
          data.linkedEntityId = idMaps[data.linkedCollection]?.get(data.linkedEntityId) || "";
          if (!data.linkedEntityId) {
            delete data.linkedCollection;
            data.budgetMode = "included";
          }
        }
        data = attachTemporalInstants(collection, data, sourceExtra.timeZone || "UTC");
        attachExactMoney(data, ENTITY_CONTRACTS[collection]?.money || [], source.currency);
        if (data.paidByUserId && data.paidByUserId !== user.id) delete data.paidByUserId;
        if (data.paidByParticipantId) {
          data.paidByParticipantId = participantIdMap.get(data.paidByParticipantId) || "";
        }
        if (Array.isArray(data.splits)) {
          data.splits = data.splits.map((split) => ({
            ...split,
            participantId: participantIdMap.get(split.participantId) ||
              (split.memberUserId === user.id ? newOwnerParticipantId : ""),
            memberUserId: split.memberUserId === user.id ? user.id : null,
          })).filter((split) => split.participantId);
        }
        if (Array.isArray(data.participantIds)) {
          data.participantIds = data.participantIds.map((id) => participantIdMap.get(id)).filter(Boolean);
        }
        if (data.participantId) data.participantId = participantIdMap.get(data.participantId) || "";
        for (const field of ["photo", "backgroundImage"]) {
          const asset = await db.prepare(
            "SELECT * FROM media_assets WHERE trip_id=? AND owner_collection=? AND owner_id=? AND field_name=?",
          ).get(tripId, collection, row.id, field);
          if (!asset) continue;
          const mediaId = newId("med");
          await db.prepare(
            `INSERT INTO media_assets(id,trip_id,owner_collection,owner_id,field_name,mime_type,bytes,byte_size,content_hash,created_by,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          ).run(
            mediaId,
            newTripId,
            collection,
            entityId,
            field,
            asset.mime_type,
            asset.bytes,
            asset.byte_size,
            asset.content_hash,
            user.id,
            timestamp,
            timestamp,
          );
          data[`${field}AssetId`] = mediaId;
          data[field] = `/api/media/${mediaId}`;
        }
        await db.prepare(
          `INSERT INTO ${table}(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(entityId, newTripId, data, 1, timestamp, timestamp, user.id, user.id);
        await syncFinancialSource(newTripId, collection, { ...data, id: entityId }, source.currency, timestamp);
      }
    }
    await db.prepare("INSERT INTO financial_projection_state(trip_id,projection_version,projected_at) VALUES (?,1,?)")
      .run(
        newTripId,
        timestamp,
      );
    await audit(
      newTripId,
      user.id,
      options.asTemplate ? "trip.template_created" : "trip.duplicated",
      "trip",
      newTripId,
      {
        sourceTripId: tripId,
        shiftedDays: options.shiftDays,
        collections: [...options.collections],
        resetProgress: options.resetProgress,
      },
    );
  });
  return json({ tripId: newTripId }, 201);
}

async function duplicateDay(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  await authorize(user.id, tripId, PERMISSIONS.TRIP_EDIT);
  const input = await body(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sourceDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate || "")) {
    throw new HttpError(422, "INVALID_DATES", "Selecciona dos fechas válidas.");
  }
  const trip = readTrip(await db.prepare("SELECT * FROM trips WHERE id=?").get(tripId));
  if (input.targetDate < trip.startDate || input.targetDate > trip.endDate) {
    throw new HttpError(422, "DATE_OUTSIDE_TRIP", "El nuevo día debe pertenecer al viaje.");
  }
  const rows = await db.prepare("SELECT * FROM activities WHERE trip_id=? AND data->>'date'=? ORDER BY data->>'start'")
    .all(
      tripId,
      input.sourceDate,
    );
  if (!rows.length) throw new HttpError(422, "EMPTY_DAY", "El día de origen no contiene actividades.");
  const shiftDays = Math.round(
    (Date.parse(`${input.targetDate}T12:00:00Z`) - Date.parse(`${input.sourceDate}T12:00:00Z`)) / 86400000,
  );
  const timestamp = now();
  const created = [];
  await transaction(async () => {
    for (const row of rows) {
      const id = newId("act");
      let data = resetEntityProgress("activities", shiftEntityDates("activities", jsonObject(row.data), shiftDays));
      data = attachTemporalInstants("activities", data, trip.timeZone);
      validateEntity("activities", data);
      await assertActivityReference(tripId, data);
      await db.prepare(
        "INSERT INTO activities(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)",
      ).run(id, tripId, data, 1, timestamp, timestamp, user.id, user.id);
      created.push({ id, ...data });
    }
    await audit(tripId, user.id, "itinerary.day_duplicated", "activities", null, {
      sourceDate: input.sourceDate,
      targetDate: input.targetDate,
      count: created.length,
    });
  });
  emit(tripId, user, "itinerary.day_duplicated", "activities", "", null);
  return json({ items: created }, 201);
}

const ARCHIVE_FORMAT = "tabi-trip";
const ARCHIVE_SCHEMA_VERSION = 3;
const entityMetadata = new Set([
  "tripId",
  "version",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
]);

function portableEntity(entity) {
  return Object.fromEntries(Object.entries(entity).filter(([key]) => !entityMetadata.has(key)));
}

function bytesToBase64(bytes) {
  let binary = "";
  const value = new Uint8Array(bytes);
  for (let offset = 0; offset < value.length; offset += 32768) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

async function portableEntityWithMedia(tripId, collection, entity) {
  const portable = portableEntity(entity);
  const assets = await db.prepare(
    "SELECT field_name,mime_type,bytes FROM media_assets WHERE trip_id=? AND owner_collection=? AND owner_id=?",
  ).all(tripId, collection, entity.id);
  for (const asset of assets) {
    portable[asset.field_name] = `data:${asset.mime_type};base64,${bytesToBase64(asset.bytes)}`;
    delete portable[`${asset.field_name}AssetId`];
  }
  return portable;
}

function exportedTrip(row) {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    country: row.country,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    travelers: row.travelers,
    budget: row.budget,
    currency: row.currency,
    extra: jsonObject(row.data),
  };
}

async function tripArchiveRoutes(request, user, tripId) {
  if (request.method === "GET") {
    await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    const trip = await db.prepare("SELECT * FROM trips WHERE id=?").get(tripId);
    const collections = Object.fromEntries(
      await Promise.all(
        Object.entries(ENTITY_TABLES).filter(([collection]) => PORTABLE_COLLECTIONS.has(collection)).map(
          async ([collection, table]) => {
            const entities =
              (await db.prepare(`SELECT * FROM ${table} WHERE trip_id=? ORDER BY created_at`).all(tripId))
                .map(readEntity);
            return [
              collection,
              await Promise.all(entities.map((entity) => portableEntityWithMedia(tripId, collection, entity))),
            ];
          },
        ),
      ),
    );
    return json({
      format: ARCHIVE_FORMAT,
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      exportedAt: now(),
      editingGuide: {
        purpose: "Archivo completo y editable de un viaje de Tabi.",
        rules: [
          "Conserva format, schemaVersion y todas las claves de collections.",
          "No cambies los id existentes: conectan actividades con lugares, alojamientos y transportes.",
          "Para crear un elemento nuevo, omite su id; si otro elemento nuevo debe referenciarlo, usa un id único como place_new_1 en ambos.",
          "Para eliminar un elemento, elimínalo de su colección.",
          "Devuelve JSON válido, sin bloques Markdown ni comentarios.",
        ],
      },
      trip: exportedTrip(trip),
      collections,
    });
  }
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  await authorize(user.id, tripId, PERMISSIONS.TRIP_EDIT);
  const input = await body(request, CONFIG.maxArchiveBytes);
  return importTripArchive(input.archive || input, user, tripId);
}

async function importTripArchive(archive, user, tripId) {
  if (archive?.format !== ARCHIVE_FORMAT || ![1, 2, ARCHIVE_SCHEMA_VERSION].includes(archive?.schemaVersion)) {
    throw new HttpError(
      422,
      "INVALID_ARCHIVE",
      "El archivo no es un proyecto Tabi compatible.",
    );
  }
  if (!archive.trip || typeof archive.trip !== "object" || Array.isArray(archive.trip)) {
    throw new HttpError(422, "INVALID_ARCHIVE", "El archivo no contiene los datos generales del viaje.");
  }
  const trip = {
    name: String(archive.trip.name || "").trim(),
    emoji: String(archive.trip.emoji || "✈️"),
    country: String(archive.trip.country || ""),
    startDate: archive.trip.startDate,
    endDate: archive.trip.endDate,
    travelers: Number(archive.trip.travelers || 1),
    budget: Number(archive.trip.budget || 0),
    currency: String(archive.trip.currency || "JPY"),
    extra: archive.trip.extra && typeof archive.trip.extra === "object" && !Array.isArray(archive.trip.extra)
      ? archive.trip.extra
      : {},
  };
  validateTrip(trip);
  if (!Number.isInteger(trip.travelers) || trip.travelers < 1 || !Number.isFinite(trip.budget) || trip.budget < 0) {
    throw new HttpError(422, "INVALID_ARCHIVE", "Viajeros o presupuesto no válidos en el archivo.");
  }
  if (!archive.collections || typeof archive.collections !== "object" || Array.isArray(archive.collections)) {
    throw new HttpError(422, "INVALID_ARCHIVE", "El archivo no contiene las colecciones del viaje.");
  }

  const prepared = {};
  const idMaps = {};
  for (const [collection, table] of Object.entries(ENTITY_TABLES)) {
    const sources = !PORTABLE_COLLECTIONS.has(collection) ||
        (OPTIONAL_ARCHIVE_COLLECTIONS.has(collection) && archive.collections[collection] === undefined)
      ? []
      : archive.collections[collection];
    if (!Array.isArray(sources)) {
      throw new HttpError(422, "INVALID_ARCHIVE", `Falta la colección “${collection}” en el archivo.`);
    }
    const sourceIds = new Set();
    idMaps[collection] = new Map();
    prepared[collection] = [];
    for (const source of sources) {
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new HttpError(422, "INVALID_ARCHIVE", `Hay un elemento no válido en “${collection}”.`);
      }
      const sourceId = source.id == null ? "" : String(source.id);
      if (sourceId && !/^[A-Za-z0-9_-]{1,120}$/.test(sourceId)) {
        throw new HttpError(422, "INVALID_ARCHIVE", `Hay un id no válido en “${collection}”.`);
      }
      if (sourceId && sourceIds.has(sourceId)) {
        throw new HttpError(422, "INVALID_ARCHIVE", `El id “${sourceId}” está repetido en “${collection}”.`);
      }
      if (sourceId) sourceIds.add(sourceId);
      const collision = sourceId ? await db.prepare(`SELECT trip_id FROM ${table} WHERE id=?`).get(sourceId) : null;
      const targetId = sourceId && (!collision || collision.trip_id === tripId)
        ? sourceId
        : newId(collection.slice(0, 3));
      if (sourceId) idMaps[collection].set(sourceId, targetId);
      let data = cleanEntity(source);
      data = attachTemporalInstants(collection, data, trip.timeZone || trip.extra?.timeZone || "UTC");
      attachExactMoney(data, ENTITY_CONTRACTS[collection]?.money || [], trip.currency);
      validateEntity(collection, data);
      await assertFinancialMembers(tripId, data, collection);
      prepared[collection].push({ id: targetId, data });
    }
  }
  await Promise.all(
    prepared.places.map(async (item) => {
      if (googleMapsUrl(item.data.link)) item.data.link = await resolveGoogleMapsUrl(item.data.link);
    }),
  );

  const warnings = [];
  const rewriteReference = (item, field, collection) => {
    if (!item.data[field]) return;
    const mapped = idMaps[collection].get(String(item.data[field]));
    if (!mapped) {
      warnings.push(`La actividad “${item.data.title || item.id}” conserva un ${field} sin elemento asociado.`);
      return;
    }
    item.data[field] = mapped;
  };
  for (const activity of prepared.activities) {
    rewriteReference(activity, "placeId", "places");
    rewriteReference(activity, "stayId", "stays");
    rewriteReference(activity, "transportId", "transports");
  }
  for (const reservation of prepared.reservations) {
    if (!reservation.data.linkedCollection || !reservation.data.linkedEntityId) continue;
    const targetMap = idMaps[reservation.data.linkedCollection];
    const mapped = targetMap?.get(String(reservation.data.linkedEntityId));
    if (mapped) reservation.data.linkedEntityId = mapped;
    else {
      warnings.push(
        `La reserva “${reservation.data.title || reservation.id}” se ha desvinculado porque falta su elemento.`,
      );
      delete reservation.data.linkedCollection;
      delete reservation.data.linkedEntityId;
    }
  }
  const acceptedPlaces = [];
  for (const item of prepared.places) {
    const duplicate = findPlaceDuplicate(item.data, acceptedPlaces);
    if (duplicate) {
      throw new HttpError(
        422,
        "DUPLICATE_PLACE_IN_ARCHIVE",
        `El archivo contiene el lugar duplicado “${item.data.name}”.`,
      );
    }
    acceptedPlaces.push({ id: item.id, ...item.data });
  }
  const inspirationUrls = new Set();
  for (const item of prepared.inspirations) {
    if (inspirationUrls.has(item.data.url)) {
      throw new HttpError(
        422,
        "DUPLICATE_INSPIRATION_IN_ARCHIVE",
        "El archivo contiene enlaces de inspiración repetidos.",
      );
    }
    inspirationUrls.add(item.data.url);
  }

  const timestamp = now();
  const entityCount = Object.values(prepared).reduce((sum, items) => sum + items.length, 0);
  const importedTripExtra = tripExtra({ ...trip, ...trip.extra });
  await transaction(async () => {
    await db.prepare("DELETE FROM entity_comments WHERE trip_id=?").run(tripId);
    await db.prepare("DELETE FROM route_estimates WHERE trip_id=?").run(tripId);
    await db.prepare("DELETE FROM media_assets WHERE trip_id=?").run(tripId);
    await db.prepare("DELETE FROM expense_splits WHERE trip_id=?").run(tripId);
    await db.prepare("DELETE FROM financial_transactions WHERE trip_id=?").run(tripId);
    await db.prepare("DELETE FROM financial_projection_state WHERE trip_id=?").run(tripId);
    for (const table of Object.values(ENTITY_TABLES)) {
      await db.prepare(`DELETE FROM ${table} WHERE trip_id=?`).run(tripId);
    }
    await db.prepare(
      "UPDATE trips SET name=?,emoji=?,country=?,start_date=?,end_date=?,travelers=?,budget=?,currency=?,data=?,version=version+1,updated_at=?,updated_by=? WHERE id=?",
    ).run(
      trip.name,
      trip.emoji,
      trip.country,
      trip.startDate,
      trip.endDate,
      trip.travelers,
      trip.budget,
      trip.currency,
      importedTripExtra,
      timestamp,
      user.id,
      tripId,
    );
    for (const [collection, table] of Object.entries(ENTITY_TABLES)) {
      for (const item of prepared[collection]) {
        await extractMediaAssets(tripId, collection, item.id, item.data, user.id);
        await db.prepare(
          `INSERT INTO ${table}(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(item.id, tripId, item.data, 1, timestamp, timestamp, user.id, user.id);
        await syncFinancialSource(tripId, collection, { ...item.data, id: item.id }, trip.currency, timestamp);
      }
    }
    await db.prepare("INSERT INTO financial_projection_state(trip_id,projection_version,projected_at) VALUES (?,1,?)")
      .run(
        tripId,
        timestamp,
      );
    await audit(tripId, user.id, "trip.archive_imported", "trip", tripId, {
      entityCount,
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
    });
  });
  emit(tripId, user, "trip.archive_imported", "trips", tripId);
  return json({
    imported: entityCount,
    warnings,
    trip: readTrip(await db.prepare("SELECT * FROM trips WHERE id=?").get(tripId)),
  });
}

async function importTripData(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  await authorize(user.id, tripId, PERMISSIONS.TRIP_EDIT);
  const input = await body(request);
  const timestamp = now();
  let count = 0;
  await transaction(async () => {
    for (const [collection, table] of Object.entries(ENTITY_TABLES)) {
      if (!PORTABLE_COLLECTIONS.has(collection)) continue;
      for (const source of input[collection] || []) {
        let data = cleanEntity(source);
        delete data.id;
        delete data.tripId;
        data = attachTemporalInstants(collection, data, await tripTimeZone(tripId));
        attachExactMoney(data, ENTITY_CONTRACTS[collection]?.money || [], await tripCurrency(tripId));
        validateEntity(collection, data);
        await assertFinancialMembers(tripId, data, collection);
        const entityId = newId(collection.slice(0, 3));
        await extractMediaAssets(tripId, collection, entityId, data, user.id);
        await db.prepare(
          `INSERT INTO ${table}(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(entityId, tripId, data, 1, timestamp, timestamp, user.id, user.id);
        await syncFinancialSource(tripId, collection, { ...data, id: entityId }, await tripCurrency(tripId), timestamp);
        count++;
      }
    }
    await audit(tripId, user.id, "trip.imported", "trip", tripId, { entityCount: count });
  });
  emit(tripId, user, "trip.imported", "trips", tripId);
  return json({ imported: count });
}

function readTrip(row) {
  const extra = jsonObject(row.data);
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    country: row.country,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    travelers: row.travelers,
    budget: Number(row.budget),
    currency: row.currency,
    secondaryCurrency: extra.secondaryCurrency || alternateCurrency(row.currency),
    exchangeRateMode: extra.exchangeRateMode || "manual",
    manualExchangeRate: Number(extra.manualExchangeRate || extra.exchangeRate || 0.0058),
    exchangeRate: Number(extra.manualExchangeRate || extra.exchangeRate || 0.0058),
    budgetCurrency: extra.budgetCurrency || row.currency,
    budgetMoney: extra.budgetMoney || createMoney(row.budget, extra.budgetCurrency || row.currency),
    timeZone: extra.timeZone || "UTC",
    isTemplate: Boolean(extra.isTemplate),
    extra,
    version: row.version,
    createdAt: isoValue(row.created_at),
    updatedAt: isoValue(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    role: row.role,
    memberCount: Number(row.member_count || 0),
  };
}
function readEntity(row) {
  return {
    ...jsonObject(row.data),
    id: row.id,
    tripId: row.trip_id,
    version: row.version,
    createdAt: isoValue(row.created_at),
    updatedAt: isoValue(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}
function cleanEntity(input) {
  const blocked = new Set(["id", "tripId", "version", "createdAt", "updatedAt", "createdBy", "updatedBy"]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !blocked.has(key)));
}
function readMembership(row) {
  return {
    userId: row.user_id,
    tripId: row.trip_id,
    role: row.role,
    joinedAt: isoValue(row.joined_at),
    invitedBy: row.invited_by,
    permissions: permissionsForRole(row.role),
  };
}
async function listMembers(tripId) {
  return (await db.prepare(
    `SELECT ${userSelect},tm.role,tm.joined_at,tm.invited_by FROM trip_members tm JOIN users u ON u.id=tm.user_id WHERE tm.trip_id=? ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,u.name`,
  ).all(tripId)).map((row) => ({
    user: publicUser(row),
    role: row.role,
    joinedAt: isoValue(row.joined_at),
    invitedBy: row.invited_by,
  }));
}
async function listLogs(tripId) {
  return (await db.prepare(
    "SELECT l.*,u.name user_name,u.avatar_url FROM trip_activity_logs l LEFT JOIN users u ON u.id=l.user_id WHERE l.trip_id=? ORDER BY l.created_at DESC LIMIT 50",
  ).all(tripId)).map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    userName: row.user_name || "Usuario eliminado",
    avatarUrl: row.avatar_url || "",
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: jsonObject(row.metadata),
    createdAt: isoValue(row.created_at),
  }));
}
async function listInvitations(tripId) {
  return (await db.prepare(
    "SELECT i.*,u.name creator_name FROM trip_invitations i JOIN users u ON u.id=i.created_by WHERE i.trip_id=? ORDER BY i.created_at DESC",
  ).all(tripId)).map(readInvitation);
}
function readInvitation(row) {
  const expiresAt = isoValue(row.expires_at);
  const status = row.revoked_at
    ? "revoked"
    : expiresAt <= now()
    ? "expired"
    : row.uses >= row.max_uses
    ? "used"
    : "active";
  return {
    id: row.id,
    tripId: row.trip_id,
    role: row.role,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    createdAt: isoValue(row.created_at),
    expiresAt,
    maxUses: row.max_uses,
    uses: row.uses,
    status,
    version: row.version,
  };
}
async function invitationByHash(hash) {
  return await db.prepare(
    "SELECT i.*,t.name trip_name,t.emoji trip_emoji,u.name creator_name FROM trip_invitations i JOIN trips t ON t.id=i.trip_id JOIN users u ON u.id=i.created_by WHERE i.token_hash=?",
  ).get(hash);
}
function publicInvitation(row) {
  const invitation = readInvitation(row);
  return { ...invitation, tripName: row.trip_name, tripEmoji: row.trip_emoji };
}
function validateInvitation(row) {
  if (!row) throw new HttpError(404, "INVITATION_NOT_FOUND", "La invitación no existe.");
  if (row.revoked_at) throw new HttpError(410, "INVITATION_REVOKED", "La invitación ha sido revocada.");
  if (isoValue(row.expires_at) <= now()) throw new HttpError(410, "INVITATION_EXPIRED", "La invitación ha caducado.");
  if (row.uses >= row.max_uses) {
    throw new HttpError(410, "INVITATION_USED", "La invitación ha alcanzado su número máximo de usos.");
  }
}
async function audit(tripId, userId, action, entityType, entityId, metadata) {
  await db.prepare(
    "INSERT INTO trip_activity_logs(id,trip_id,user_id,action,entity_type,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(newId("log"), tripId, userId, action, entityType, entityId, metadata || {}, now());
}
function jsonObject(value) {
  if (!value) return {};
  return typeof value === "string" ? JSON.parse(value) : value;
}
function isoValue(value) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}
function dateOnly(value) {
  return isoValue(value).slice(0, 10);
}
function emit(tripId, user, action, collection, entityId, item) {
  publish(tripId, { action, collection, entityId, item, user: { id: user.id, name: user.name }, at: now() });
}
function entityTitle(collection, item) {
  return item.title || item.name || item.product ||
    ({ expenses: "Gasto", inspirations: "Inspiración" })[collection] || "Elemento";
}

async function assertUniqueInspiration(tripId, url, excludedId = "") {
  const duplicate = await db.prepare(
    "SELECT id FROM inspirations WHERE trip_id=? AND data->>'url'=? AND id<>?",
  ).get(tripId, url, excludedId);
  if (duplicate) throw new HttpError(409, "INSPIRATION_EXISTS", "Este enlace ya está guardado en el viaje.");
}
async function assertUniquePlace(tripId, candidate, excludedId = "") {
  const places = (await db.prepare("SELECT * FROM places WHERE trip_id=?").all(tripId)).map(readEntity);
  const duplicate = findPlaceDuplicate(candidate, places, excludedId);
  if (!duplicate) return;
  const reason = duplicate.reason === "link" ? "enlace de Google Maps" : "nombre y ciudad";
  throw new HttpError(
    409,
    "PLACE_EXISTS",
    `Ya existe “${duplicate.place.name}” con el mismo ${reason}.`,
    { duplicateId: duplicate.place.id, reason: duplicate.reason },
  );
}
async function assertActivityReference(tripId, activity) {
  const relation = {
    Lugar: ["places", activity.placeId],
    Hospedaje: ["stays", activity.stayId],
    Transporte: ["transports", activity.transportId],
  }[activity.activityKind];
  if (!relation) return;
  const [collection, id] = relation;
  const table = entityTable(collection);
  if (!await db.prepare(`SELECT 1 FROM ${table} WHERE id=? AND trip_id=?`).get(id, tripId)) {
    throw new HttpError(422, "INVALID_ACTIVITY_LINK", "El elemento vinculado no existe en este viaje.");
  }
}
async function assertReservationReference(tripId, reservation) {
  if (!reservation.linkedCollection && !reservation.linkedEntityId) return;
  if (!["stays", "transports", "activities"].includes(reservation.linkedCollection) || !reservation.linkedEntityId) {
    throw new HttpError(422, "INVALID_RESERVATION_LINK", "La vinculación de la reserva no es válida.");
  }
  if (
    !await db.prepare(`SELECT 1 FROM ${entityTable(reservation.linkedCollection)} WHERE id=? AND trip_id=?`).get(
      reservation.linkedEntityId,
      tripId,
    )
  ) {
    throw new HttpError(422, "INVALID_RESERVATION_LINK", "El elemento vinculado no existe en este viaje.");
  }
}
async function assertFinancialMembers(tripId, data, collection = "") {
  const splitIds = (data.splits || []).map((split) => split?.memberUserId).filter(Boolean);
  const splitParticipantIds = (data.splits || []).map((split) => split?.participantId).filter(Boolean);
  const participantIds = [
    data.paidByParticipantId,
    data.participantId,
    ...(Array.isArray(data.participantIds) ? data.participantIds : []),
    ...splitParticipantIds,
  ].filter(Boolean);
  if (new Set(splitIds).size !== splitIds.length) {
    throw new HttpError(422, "DUPLICATE_SPLIT_MEMBER", "Un viajero no puede aparecer dos veces en el reparto.");
  }
  const memberIds = [data.paidByUserId, ...splitIds].filter(Boolean);
  for (const userId of new Set(memberIds)) {
    if (!await db.prepare("SELECT 1 FROM trip_members WHERE trip_id=? AND user_id=?").get(tripId, userId)) {
      throw new HttpError(422, "INVALID_FINANCIAL_MEMBER", "El pagador o participante no pertenece al viaje.");
    }
  }
  if (new Set(splitParticipantIds).size !== splitParticipantIds.length) {
    throw new HttpError(422, "DUPLICATE_SPLIT_PARTICIPANT", "Un participante no puede aparecer dos veces.");
  }
  for (const participantId of new Set(participantIds)) {
    if (
      !await db.prepare("SELECT 1 FROM trip_participants WHERE trip_id=? AND id=? AND active=TRUE").get(
        tripId,
        participantId,
      )
    ) throw new HttpError(422, "INVALID_FINANCIAL_PARTICIPANT", "El participante no pertenece al viaje.");
  }
  const exactSplits = (data.splits || []).filter((split) => split?.amountMinor !== undefined);
  if (exactSplits.length) {
    if (exactSplits.length !== data.splits.length) {
      throw new HttpError(422, "INVALID_SPLIT_TOTAL", "No mezcles importes exactos con repartos proporcionales.");
    }
    const paidField = collection === "expenses"
      ? "actualAmount"
      : collection === "purchases"
      ? "actualPrice"
      : "paidAmount";
    const total = monetaryField(data, paidField, data.currency || "JPY");
    const splitTotal = exactSplits.reduce((sum, split) => sum + BigInt(split.amountMinor), 0n);
    if (splitTotal !== BigInt(total.minorUnits)) {
      throw new HttpError(422, "INVALID_SPLIT_TOTAL", "Los importes del reparto deben sumar el total pagado.");
    }
  }
}
function conflict(currentVersion) {
  throw new HttpError(
    409,
    "VERSION_CONFLICT",
    "Otra persona ha actualizado este elemento. Recarga los cambios antes de volver a editar.",
    { currentVersion },
  );
}
function validateTrip(input) {
  if (String(input.name || "").trim().length < 2) {
    throw new HttpError(422, "INVALID_TRIP", "El viaje necesita un nombre.");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate || "") ||
    input.startDate > input.endDate
  ) throw new HttpError(422, "INVALID_DATES", "Las fechas del viaje no son válidas.");
  const travelers = Number(input.travelers ?? 1);
  const budget = Number(input.budget ?? 0);
  const exchangeRate = Number(
    input.manualExchangeRate ?? input.exchangeRate ?? input.extra?.manualExchangeRate ?? input.extra?.exchangeRate ??
      0.0058,
  );
  if (!Number.isInteger(travelers) || travelers < 1) {
    throw new HttpError(422, "INVALID_TRAVELERS", "El número de viajeros debe ser un entero positivo.");
  }
  if (!Number.isFinite(budget) || budget < 0) {
    throw new HttpError(422, "INVALID_BUDGET", "El presupuesto no es válido.");
  }
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new HttpError(422, "INVALID_EXCHANGE_RATE", "El tipo de cambio debe ser mayor que cero.");
  }
  const primary = input.currency || "JPY";
  const secondary = input.secondaryCurrency || input.extra?.secondaryCurrency || alternateCurrency(primary);
  if (!isSupportedCurrency(primary) || !isSupportedCurrency(secondary) || primary === secondary) {
    throw new HttpError(422, "INVALID_CURRENCY_PAIR", "Selecciona dos monedas distintas y compatibles.");
  }
  const mode = input.exchangeRateMode || input.extra?.exchangeRateMode || "manual";
  if (!["automatic", "manual"].includes(mode)) {
    throw new HttpError(422, "INVALID_EXCHANGE_MODE", "El modo de tipo de cambio no es válido.");
  }
  const timeZone = input.timeZone || input.extra?.timeZone || "UTC";
  if (!isValidTimeZone(timeZone)) {
    throw new HttpError(422, "INVALID_TIME_ZONE", "La zona horaria del viaje no es válida.");
  }
}

function tripExtra(input, current = {}) {
  const supplied = input.extra && typeof input.extra === "object" && !Array.isArray(input.extra) ? input.extra : {};
  const primary = input.currency || "JPY";
  const legacyRate = input.exchangeRate ?? supplied.exchangeRate;
  const budgetCurrency = current.budgetCurrency ?? supplied.budgetCurrency ?? input.budgetCurrency ?? primary;
  return {
    ...current,
    ...supplied,
    secondaryCurrency: input.secondaryCurrency ?? supplied.secondaryCurrency ?? current.secondaryCurrency ??
      alternateCurrency(primary),
    exchangeRateMode: input.exchangeRateMode ?? supplied.exchangeRateMode ?? current.exchangeRateMode ??
      (legacyRate === undefined ? "automatic" : "manual"),
    manualExchangeRate: Number(
      input.manualExchangeRate ?? legacyRate ?? supplied.manualExchangeRate ?? current.manualExchangeRate ?? 0.0058,
    ),
    budgetCurrency,
    budgetMoney: createMoney(input.budget || 0, budgetCurrency),
    timeZone: input.timeZone ?? supplied.timeZone ?? current.timeZone ?? "UTC",
  };
}

async function tripTimeZone(tripId) {
  const row = await db.prepare("SELECT data FROM trips WHERE id=?").get(tripId);
  return jsonObject(row?.data).timeZone || "UTC";
}
function validateEntity(collection, data) {
  const contractIssues = entityContractIssues(collection, data);
  if (contractIssues.length) {
    const issue = contractIssues[0];
    throw new HttpError(422, issue.code, issue.message, { issues: contractIssues });
  }
  if (Object.keys(data).length > 60) {
    throw new HttpError(422, "INVALID_ENTITY", "El elemento contiene demasiados campos.");
  }
  for (const field of ["timeZone", "departureTimeZone", "arrivalTimeZone"]) {
    if (data[field] && !isValidTimeZone(data[field])) {
      throw new HttpError(422, "INVALID_TIME_ZONE", "Una zona horaria no es válida.");
    }
  }
  if (collection === "activities" && (!data.startsAt || !data.endsAt)) {
    throw new HttpError(422, "INVALID_LOCAL_TIME", "La hora no existe en la zona horaria seleccionada.");
  }
  if (collection === "reminders" && !data.remindInstant) {
    throw new HttpError(422, "INVALID_LOCAL_TIME", "La hora del recordatorio no existe en esa zona horaria.");
  }
  for (const [field, value] of Object.entries(data)) {
    const imageField = field === "photo" || field === "backgroundImage";
    const maxLength = imageField && /^data:image\/(?:jpeg|png|webp);base64,/.test(value) ? 350_000 : 10_000;
    if (typeof value === "string" && value.length > maxLength) {
      throw new HttpError(422, "INVALID_ENTITY", "Uno de los campos es demasiado largo.");
    }
  }
  const required = {
    activities: ["title", "date", "start", "end"],
    places: ["name", "city"],
    tasks: ["title"],
    purchases: ["product"],
    expenses: ["title"],
    funds: ["title", "amount"],
    stays: ["name", "checkInDate", "checkOutDate"],
    transports: ["origin", "destination", "departureDate"],
    reservations: ["title", "date"],
    inspirations: ["url"],
    notes: ["title"],
  }[collection] || [];
  if (required.some((field) => !String(data[field] || "").trim())) {
    throw new HttpError(422, "MISSING_FIELDS", "Faltan campos obligatorios.");
  }
  if (collection === "tasks") delete data.phase;
  if (data.currency && !isSupportedCurrency(data.currency)) {
    throw new HttpError(422, "UNSUPPORTED_CURRENCY", "La moneda del importe no está soportada.");
  }
  const validStoredImage = (value) =>
    /^data:image\/(?:jpeg|png|webp);base64,/.test(value) || /^\/api\/media\/med_[A-Za-z0-9]+$/.test(value);
  if (collection === "purchases" && data.photo && !validStoredImage(data.photo)) {
    throw new HttpError(422, "INVALID_PURCHASE_PHOTO", "La foto del producto no tiene un formato válido.");
  }
  if (collection === "places") {
    if (data.backgroundMode && !["auto", "image", "color", "emoji"].includes(data.backgroundMode)) {
      throw new HttpError(422, "INVALID_PLACE_BACKGROUND", "El tipo de fondo del lugar no es válido.");
    }
    if (data.backgroundImage && !validStoredImage(data.backgroundImage)) {
      throw new HttpError(422, "INVALID_PLACE_BACKGROUND", "La imagen de fondo no tiene un formato válido.");
    }
  }
  if (collection === "activities" && data.end <= data.start) {
    throw new HttpError(422, "INVALID_TIME", "La hora final debe ser posterior a la inicial.");
  }
  if (collection === "availabilities" && data.endAt <= data.startAt) {
    throw new HttpError(422, "INVALID_AVAILABILITY", "El final de la disponibilidad debe ser posterior al inicio.");
  }
  if (
    collection === "availabilities" &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.startAt) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.endAt))
  ) {
    throw new HttpError(422, "INVALID_AVAILABILITY", "Las fechas de disponibilidad no son válidas.");
  }
  if (collection === "locationShares") {
    const expiresAt = Date.parse(data.expiresAt);
    if (
      !Number.isFinite(Number(data.latitude)) || Math.abs(Number(data.latitude)) > 90 ||
      !Number.isFinite(Number(data.longitude)) || Math.abs(Number(data.longitude)) > 180 ||
      !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 60 * 60 * 1000
    ) {
      throw new HttpError(422, "INVALID_LOCATION_SHARE", "La ubicación temporal no es válida.");
    }
  }
  if (collection === "activities" && data.activityKind) {
    if (!["General", "Lugar", "Hospedaje", "Transporte"].includes(data.activityKind)) {
      throw new HttpError(422, "INVALID_ACTIVITY_KIND", "El tipo de actividad no es válido.");
    }
    const requiredLink = { Lugar: "placeId", Hospedaje: "stayId", Transporte: "transportId" }[data.activityKind];
    if (requiredLink && !String(data[requiredLink] || "").trim()) {
      throw new HttpError(422, "MISSING_ACTIVITY_LINK", "La actividad necesita un elemento vinculado.");
    }
  }
  if (
    collection === "places" && data.admission &&
    !["No necesita entrada", "Entrada gratuita", "Entrada de pago", "Reserva obligatoria"].includes(data.admission)
  ) {
    throw new HttpError(422, "INVALID_ADMISSION", "El tipo de entrada del lugar no es válido.");
  }
  if (
    collection === "places" &&
    [data.photoUrl, data.photoAttributionUrl].some((value) => value && !String(value).startsWith("https://"))
  ) {
    throw new HttpError(422, "INVALID_PLACE_PHOTO", "La referencia de la foto de Google Maps no es válida.");
  }
  if (collection === "stays" || collection === "reservations") {
    if (
      data.checkOutDate < data.checkInDate ||
      (data.checkOutDate === data.checkInDate && data.checkInTime && data.checkOutTime &&
        data.checkOutTime <= data.checkInTime)
    ) {
      throw new HttpError(422, "INVALID_STAY_DATES", "La salida debe ser posterior a la entrada.");
    }
    if (data.platform && !["En persona", "Airbnb", "Booking", "Otros"].includes(data.platform)) {
      throw new HttpError(422, "INVALID_BOOKING_PLATFORM", "La plataforma de reserva no es válida.");
    }
    if (data.bookingStatus && !["Pendiente", "Confirmada", "Cancelada"].includes(data.bookingStatus)) {
      throw new HttpError(422, "INVALID_BOOKING_STATUS", "El estado de la reserva no es válido.");
    }
    if (
      data.luggageStorage &&
      !["Por confirmar", "No", "Antes del check-in", "Después del check-out", "Antes y después"].includes(
        data.luggageStorage,
      )
    ) {
      throw new HttpError(422, "INVALID_LUGGAGE_STORAGE", "La opción para guardar maletas no es válida.");
    }
    if (data.cancellationDeadline && data.cancellationDeadline > data.checkInDate) {
      throw new HttpError(
        422,
        "INVALID_CANCELLATION_DEADLINE",
        "La fecha límite de cancelación no puede ser posterior a la entrada.",
      );
    }
  }
  if (
    collection === "transports" && data.arrivalDate &&
    (data.arrivalAt && data.departureAt
      ? data.arrivalAt <= data.departureAt
      : `${data.arrivalDate}T${data.arrivalTime || "23:59"}` <
        `${data.departureDate}T${data.departureTime || "00:00"}`)
  ) {
    throw new HttpError(422, "INVALID_TRANSPORT_DATES", "La llegada no puede ser anterior a la salida.");
  }
  if (collection === "inspirations") {
    const allowedFields = new Set(["url", "category", "note", "watched"]);
    if (Object.keys(data).some((field) => !allowedFields.has(field))) {
      throw new HttpError(422, "INVALID_INSPIRATION", "La inspiración contiene campos no permitidos.");
    }
    const link = inspirationLink(data.url);
    if (!link) {
      throw new HttpError(
        422,
        "INVALID_INSPIRATION_URL",
        "El enlace debe ser un vídeo de TikTok, Instagram o YouTube.",
      );
    }
    data.url = link.url;
    const categories = [
      "Lugares",
      "Comida",
      "Actividades",
      "Compras",
      "Alojamiento",
      "Transporte",
      "Consejos",
      "Otros",
    ];
    data.category = categories.includes(data.category) ? data.category : "Otros";
    data.note = String(data.note || "").trim();
    data.watched = data.watched === true || data.watched === "true";
    if (data.note.length > 2000) {
      throw new HttpError(422, "INVALID_INSPIRATION_NOTE", "La nota no puede superar los 2000 caracteres.");
    }
  }
  for (
    const field of [
      "amount",
      "estimatedAmount",
      "actualAmount",
      "estimatedPrice",
      "actualPrice",
      "maxBudget",
      "price",
      "paidAmount",
      "ticketPrice",
    ]
  ) {
    if (data[field] !== undefined && (!Number.isFinite(Number(data[field])) || Number(data[field]) < 0)) {
      throw new HttpError(422, "INVALID_AMOUNT", "Los importes deben ser números positivos.");
    }
  }
  if (collection === "funds" && Number(data.amount) <= 0) {
    throw new HttpError(422, "INVALID_AMOUNT", "La aportación debe ser mayor que cero.");
  }
  if (collection === "purchases" && Number(data.actualPrice || 0) > 0) {
    data.status = "Comprado";
  }
  if (["stays", "transports", "reservations"].includes(collection)) {
    const total = Number(data.price || 0);
    const paid = Number(data.paidAmount || 0);
    if (paid > total) {
      throw new HttpError(422, "INVALID_AMOUNT", "El importe pagado no puede superar el precio total.");
    }
    if (data.paymentStatus === "Pagado") data.paidAmount = total;
    else if (paid > 0) data.paymentStatus = paid >= total && total > 0 ? "Pagado" : "Parcial";
    else if (data.paymentStatus !== "Pagado") data.paymentStatus = "Pendiente";
  }
}

async function tripCurrency(tripId) {
  return (await db.prepare("SELECT currency FROM trips WHERE id=?").get(tripId)).currency;
}

async function attachEntityMoney(tripId, collection, data) {
  const fields = ENTITY_CONTRACTS[collection]?.money || [];
  if (!fields.length) return;
  attachExactMoney(data, fields, await tripCurrency(tripId));
}

const monetaryFields = new Set(MONEY_FIELDS);

async function attachExchangeSnapshot(tripId, data, submitted = data) {
  if (!data.currency || ![...monetaryFields].some((field) => field in data)) return;
  const monetaryChange = !data.exchangeRateSnapshot ||
    Object.keys(submitted).some((field) => field === "currency" || monetaryFields.has(field));
  if (!monetaryChange) return;
  const row = await db.prepare("SELECT currency,data FROM trips WHERE id=?").get(tripId);
  const primary = row.currency;
  const source = data.currency;
  const extra = jsonObject(row.data);
  let rate = 1;
  let provider = "identity";
  let rateDate = now().slice(0, 10);
  if (source !== primary) {
    const secondary = extra.secondaryCurrency || alternateCurrency(primary);
    const manual = Number(extra.manualExchangeRate || extra.exchangeRate || 0);
    if (extra.exchangeRateMode === "manual" && source === secondary && manual > 0) {
      rate = 1 / manual;
      provider = "manual";
    } else {
      try {
        const exchange = await getExchangeRate(source, primary);
        rate = exchange.rate;
        provider = exchange.provider;
        rateDate = exchange.rateDate;
      } catch {
        throw new HttpError(
          503,
          "EXCHANGE_RATE_UNAVAILABLE",
          "No se puede guardar el importe sin un cambio histórico. Reinténtalo o configura un cambio manual.",
        );
      }
    }
  }
  data.exchangeRateSnapshot = rate;
  data.exchangeRateBase = source;
  data.exchangeRateQuote = primary;
  data.exchangeRateDate = rateDate;
  data.exchangeRateProvider = provider;
}
function diff(before, after) {
  const ignored = new Set([
    "id",
    "tripId",
    "version",
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
    "photo",
    "backgroundImage",
  ]);
  return Object.fromEntries(
    Object.keys(after).filter((key) => !ignored.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => [key, { from: before[key] ?? null, to: after[key] ?? null }]),
  );
}
