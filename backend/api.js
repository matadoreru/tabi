import { db, entityTable, transaction } from "./database.js";
import {
  authCookie,
  changePassword,
  clearAuthCookie,
  currentUser,
  login,
  logout,
  publicUser,
  register,
} from "./auth.js";
import { assertResourceInTrip, authorize, membership } from "./authorization.js";
import { randomToken, sha256 } from "./crypto.js";
import { CONFIG, ENTITY_TABLES } from "./config.js";
import { body, HttpError, json, newId, now, validateMutationOrigin } from "./http.js";
import { eventStream, publish } from "./events.js";
import { resolveGoogleMapsUrl } from "./google-maps.js";
import { PERMISSIONS, permissionsForRole } from "../src/permissions.js";
import { inspirationLink } from "../src/domain.js";

const editPermission = (collection) =>
  collection === "expenses" || collection === "funds"
    ? PERMISSIONS.BUDGET_EDIT
    : collection === "documents"
    ? PERMISSIONS.DOCUMENT_UPLOAD
    : PERMISSIONS.TRIP_EDIT;
const userSelect = "u.id,u.name,u.username,u.email,u.avatar_url,u.created_at";

export async function api(request, pathname) {
  validateMutationOrigin(request);
  const parts = pathname.split("/").filter(Boolean).slice(1);

  if (parts[0] === "health" && request.method === "GET") {
    db.prepare("SELECT 1").get();
    return json({ status: "ok" });
  }
  if (parts[0] === "auth") return authRoutes(request, parts.slice(1));
  if (parts[0] === "invite") return invitePublicRoutes(request, parts.slice(1));

  const user = await currentUser(request);
  if (parts[0] === "me" && request.method === "GET") return json({ user });
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
  if (parts[0] !== "trips") throw new HttpError(404, "NOT_FOUND", "Ruta no encontrada.");
  if (parts.length === 1) return tripCollectionRoutes(request, user);

  const tripId = parts[1];
  if (parts.length === 2) return tripRoutes(request, user, tripId);
  const resource = parts[2];
  if (resource === "bootstrap") return bootstrap(request, user, tripId);
  if (resource === "events") {
    authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    return eventStream(tripId, request.signal);
  }
  if (resource === "members") return memberRoutes(request, user, tripId, parts.slice(3));
  if (resource === "invitations") return invitationRoutes(request, user, tripId, parts.slice(3));
  if (resource === "duplicate") return duplicateTrip(request, user, tripId);
  if (resource === "leave") return leaveTrip(request, user, tripId);
  if (resource === "transfer") return transferTrip(request, user, tripId);
  if (resource === "import") return importTripData(request, user, tripId);
  if (ENTITY_TABLES[resource]) return entityRoutes(request, user, tripId, resource, parts[3]);
  throw new HttpError(404, "NOT_FOUND", "Ruta no encontrada.");
}

async function authRoutes(request, parts) {
  if (parts[0] === "register" && request.method === "POST") {
    const result = await register(await body(request));
    return json({ user: result.user }, 201, { "set-cookie": authCookie(result) });
  }
  if (parts[0] === "login" && request.method === "POST") {
    const result = await login(await body(request));
    return json({ user: result.user }, 200, { "set-cookie": authCookie(result) });
  }
  if (parts[0] === "logout" && request.method === "POST") {
    await logout(request);
    return json({ ok: true }, 200, { "set-cookie": clearAuthCookie() });
  }
  if (parts[0] === "password" && request.method === "PATCH") {
    const user = await currentUser(request);
    await changePassword(user, await body(request));
    return json({ ok: true });
  }
  throw new HttpError(404, "NOT_FOUND", "Ruta de autenticación no encontrada.");
}

async function tripCollectionRoutes(request, user) {
  if (request.method === "GET") {
    const rows = db.prepare(
      `SELECT t.*,tm.role,tm.joined_at,(SELECT COUNT(*) FROM trip_members x WHERE x.trip_id=t.id) AS member_count FROM trips t JOIN trip_members tm ON tm.trip_id=t.id WHERE tm.user_id=? ORDER BY t.start_date DESC`,
    ).all(user.id);
    return json({ trips: rows.map(readTrip) });
  }
  if (request.method === "POST") {
    const input = await body(request);
    validateTrip(input);
    const timestamp = now();
    const id = newId("trip");
    transaction(() => {
      db.prepare(
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
          "{}",
          1,
          timestamp,
          timestamp,
          user.id,
          user.id,
        );
      db.prepare("INSERT INTO trip_members(trip_id,user_id,role,joined_at,invited_by) VALUES (?,?,'owner',?,NULL)").run(
        id,
        user.id,
        timestamp,
      );
      audit(id, user.id, "trip.created", "trip", id, { name: input.name });
    });
    return json({
      trip: readTrip(db.prepare("SELECT t.*,'owner' role,1 member_count FROM trips t WHERE id=?").get(id)),
    }, 201);
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function tripRoutes(request, user, tripId) {
  if (request.method === "GET") {
    const member = authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    return json({
      trip: readTrip(db.prepare("SELECT * FROM trips WHERE id=?").get(tripId)),
      membership: readMembership(member),
    });
  }
  if (request.method === "PATCH") {
    authorize(user.id, tripId, PERMISSIONS.TRIP_EDIT);
    const input = await body(request);
    const current = db.prepare("SELECT * FROM trips WHERE id=?").get(tripId);
    if (Number(input.version) !== current.version) conflict(current.version);
    const merged = { ...readTrip(current), ...input };
    validateTrip(merged);
    const timestamp = now();
    const result = db.prepare(
      "UPDATE trips SET name=?,emoji=?,country=?,start_date=?,end_date=?,travelers=?,budget=?,currency=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND version=?",
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
        timestamp,
        user.id,
        tripId,
        current.version,
      );
    if (!result.changes) conflict(current.version + 1);
    audit(tripId, user.id, "trip.updated", "trip", tripId, diff(readTrip(current), merged));
    emit(tripId, user, "trip.updated", "trips", tripId);
    return json({ trip: readTrip(db.prepare("SELECT * FROM trips WHERE id=?").get(tripId)) });
  }
  if (request.method === "DELETE") {
    authorize(user.id, tripId, PERMISSIONS.TRIP_DELETE);
    db.prepare("DELETE FROM trips WHERE id=?").run(tripId);
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

function bootstrap(request, user, tripId) {
  if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  const member = authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
  const trip = readTrip(db.prepare("SELECT * FROM trips WHERE id=?").get(tripId));
  const collections = Object.fromEntries(
    Object.keys(ENTITY_TABLES).map((
      name,
    ) => [
      name,
      db.prepare(`SELECT * FROM ${entityTable(name)} WHERE trip_id=? ORDER BY created_at`).all(tripId).map(readEntity),
    ]),
  );
  const members = listMembers(tripId);
  const logs = listLogs(tripId);
  const invitations = permissionsForRole(member.role).includes(PERMISSIONS.MEMBER_INVITE)
    ? listInvitations(tripId)
    : [];
  return json({
    trip,
    membership: readMembership(member),
    permissions: permissionsForRole(member.role),
    members,
    logs,
    invitations,
    ...collections,
  });
}

async function entityRoutes(request, user, tripId, collection, id) {
  const table = entityTable(collection);
  if (request.method === "GET") {
    authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    return json({ items: db.prepare(`SELECT * FROM ${table} WHERE trip_id=?`).all(tripId).map(readEntity) });
  }
  authorize(user.id, tripId, editPermission(collection));
  const input = await body(request);
  const timestamp = now();
  if (request.method === "POST" && !id) {
    const entityId = newId(collection.slice(0, 3));
    const data = cleanEntity(input);
    validateEntity(collection, data);
    if (collection === "inspirations") assertUniqueInspiration(tripId, data.url);
    const title = entityTitle(collection, data);
    db.prepare(
      `INSERT INTO ${table}(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
    )
      .run(entityId, tripId, JSON.stringify(data), 1, timestamp, timestamp, user.id, user.id);
    audit(tripId, user.id, "entity.created", collection, entityId, { title });
    emit(tripId, user, "entity.created", collection, entityId);
    return json({
      item: readEntity(db.prepare(`SELECT * FROM ${table} WHERE id=? AND trip_id=?`).get(entityId, tripId)),
    }, 201);
  }
  const current = assertResourceInTrip(table, id, tripId);
  if (request.method === "PATCH") {
    if (Number(input.version) !== current.version) conflict(current.version);
    const before = readEntity(current);
    const data = { ...cleanEntity(before), ...cleanEntity(input) };
    delete data.id;
    delete data.tripId;
    validateEntity(collection, data);
    if (collection === "inspirations") assertUniqueInspiration(tripId, data.url, id);
    const result = db.prepare(
      `UPDATE ${table} SET data=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND trip_id=? AND version=?`,
    )
      .run(JSON.stringify(data), timestamp, user.id, id, tripId, current.version);
    if (!result.changes) conflict(current.version + 1);
    audit(tripId, user.id, "entity.updated", collection, id, {
      title: entityTitle(collection, data),
      changes: diff(before, data),
    });
    emit(tripId, user, "entity.updated", collection, id);
    return json({ item: readEntity(db.prepare(`SELECT * FROM ${table} WHERE id=? AND trip_id=?`).get(id, tripId)) });
  }
  if (request.method === "DELETE") {
    db.prepare(`DELETE FROM ${table} WHERE id=? AND trip_id=?`).run(id, tripId);
    audit(tripId, user.id, "entity.deleted", collection, id, { title: entityTitle(collection, readEntity(current)) });
    emit(tripId, user, "entity.deleted", collection, id);
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function memberRoutes(request, user, tripId, parts) {
  if (request.method === "GET" && !parts[0]) {
    authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    return json({ members: listMembers(tripId) });
  }
  const targetId = parts[0];
  if (!targetId) throw new HttpError(404, "NOT_FOUND", "Miembro no encontrado.");
  if (request.method === "PATCH") {
    authorize(user.id, tripId, PERMISSIONS.MEMBER_CHANGE_ROLE);
    const input = await body(request);
    if (!["editor", "viewer"].includes(input.role)) throw new HttpError(422, "INVALID_ROLE", "Rol no válido.");
    const target = membership(targetId, tripId);
    if (!target || target.role === "owner") {
      throw new HttpError(422, "OWNER_PROTECTED", "Transfiere la propiedad para cambiar al owner.");
    }
    db.prepare("UPDATE trip_members SET role=? WHERE trip_id=? AND user_id=?").run(input.role, tripId, targetId);
    audit(tripId, user.id, "member.role_changed", "member", targetId, { from: target.role, to: input.role });
    emit(tripId, user, "member.role_changed", "members", targetId);
    return json({ members: listMembers(tripId) });
  }
  if (request.method === "DELETE") {
    authorize(user.id, tripId, PERMISSIONS.MEMBER_REMOVE);
    const target = membership(targetId, tripId);
    if (!target || target.role === "owner") {
      throw new HttpError(422, "OWNER_PROTECTED", "No se puede expulsar al propietario.");
    }
    db.prepare("DELETE FROM trip_members WHERE trip_id=? AND user_id=?").run(tripId, targetId);
    audit(tripId, user.id, "member.removed", "member", targetId, { name: target.name });
    emit(tripId, user, "member.removed", "members", targetId);
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function invitationRoutes(request, user, tripId, parts) {
  authorize(user.id, tripId, PERMISSIONS.MEMBER_INVITE);
  if (request.method === "GET") return json({ invitations: listInvitations(tripId) });
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
    db.prepare(
      "INSERT INTO trip_invitations(id,trip_id,token_hash,role,created_by,created_at,expires_at,max_uses,uses,version) VALUES (?,?,?,?,?,?,?,?,0,1)",
    )
      .run(id, tripId, await sha256(token), input.role, user.id, timestamp, expiresAt, maxUses);
    audit(tripId, user.id, "invitation.created", "invitation", id, { role: input.role, maxUses, expiresAt });
    return json({
      invitation: {
        ...readInvitation(
          db.prepare(
            "SELECT i.*,u.name creator_name FROM trip_invitations i JOIN users u ON u.id=i.created_by WHERE i.id=?",
          ).get(id),
        ),
        token,
      },
    }, 201);
  }
  if (request.method === "DELETE" && parts[0]) {
    const invitation = db.prepare("SELECT * FROM trip_invitations WHERE id=? AND trip_id=?").get(parts[0], tripId);
    if (!invitation) throw new HttpError(404, "INVITATION_NOT_FOUND", "Invitación no encontrada.");
    db.prepare("UPDATE trip_invitations SET revoked_at=?,version=version+1 WHERE id=? AND trip_id=?").run(
      now(),
      parts[0],
      tripId,
    );
    audit(tripId, user.id, "invitation.revoked", "invitation", parts[0], {});
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function invitePublicRoutes(request, parts) {
  const token = parts[0];
  if (!token) throw new HttpError(404, "INVITATION_NOT_FOUND", "Invitación no encontrada.");
  const tokenHash = await sha256(token);
  if (request.method === "GET") {
    const row = invitationByHash(tokenHash);
    validateInvitation(row);
    const user = await currentUser(request, false);
    return json({ invitation: publicInvitation(row), user });
  }
  if (request.method === "POST" && parts[1] === "accept") {
    const user = await currentUser(request);
    let tripId;
    transaction(() => {
      const row = invitationByHash(tokenHash);
      validateInvitation(row);
      tripId = row.trip_id;
      const existing = membership(user.id, tripId);
      if (!existing) {
        db.prepare("INSERT INTO trip_members(trip_id,user_id,role,joined_at,invited_by) VALUES (?,?,?,?,?)").run(
          tripId,
          user.id,
          row.role,
          now(),
          row.created_by,
        );
      }
      const result = db.prepare(
        "UPDATE trip_invitations SET uses=uses+1,version=version+1 WHERE id=? AND version=? AND revoked_at IS NULL AND uses<max_uses AND expires_at>?",
      ).run(row.id, row.version, now());
      if (!result.changes) throw new HttpError(409, "INVITATION_ALREADY_USED", "La invitación ya no está disponible.");
      audit(tripId, user.id, "member.joined", "member", user.id, { role: row.role });
    });
    emit(tripId, user, "member.joined", "members", user.id);
    return json({ tripId });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

async function transferTrip(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  authorize(user.id, tripId, PERMISSIONS.OWNER_TRANSFER);
  const input = await body(request);
  const target = membership(input.userId, tripId);
  if (!target || target.role === "owner") {
    throw new HttpError(422, "INVALID_MEMBER", "Selecciona otro miembro del viaje.");
  }
  transaction(() => {
    db.prepare("UPDATE trip_members SET role='editor' WHERE trip_id=? AND user_id=?").run(tripId, user.id);
    db.prepare("UPDATE trip_members SET role='owner' WHERE trip_id=? AND user_id=?").run(tripId, input.userId);
    audit(tripId, user.id, "owner.transferred", "member", input.userId, { from: user.id, to: input.userId });
  });
  emit(tripId, user, "owner.transferred", "members", input.userId);
  return json({ ok: true });
}

function leaveTrip(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  const member = authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
  if (member.role === "owner") {
    throw new HttpError(422, "OWNER_CANNOT_LEAVE", "Transfiere la propiedad antes de abandonar el viaje.");
  }
  db.prepare("DELETE FROM trip_members WHERE trip_id=? AND user_id=?").run(tripId, user.id);
  audit(tripId, user.id, "member.left", "member", user.id, {});
  emit(tripId, user, "member.left", "members", user.id);
  return json({ ok: true });
}

function duplicateTrip(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  authorize(user.id, tripId, PERMISSIONS.TRIP_DUPLICATE);
  const source = db.prepare("SELECT * FROM trips WHERE id=?").get(tripId);
  const newTripId = newId("trip");
  const timestamp = now();
  transaction(() => {
    db.prepare(
      "INSERT INTO trips(id,name,emoji,country,start_date,end_date,travelers,budget,currency,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .run(
        newTripId,
        `${source.name} (copia)`,
        source.emoji,
        source.country,
        source.start_date,
        source.end_date,
        source.travelers,
        source.budget,
        source.currency,
        source.data,
        1,
        timestamp,
        timestamp,
        user.id,
        user.id,
      );
    db.prepare("INSERT INTO trip_members(trip_id,user_id,role,joined_at) VALUES (?,?,'owner',?)").run(
      newTripId,
      user.id,
      timestamp,
    );
    for (const table of Object.values(ENTITY_TABLES)) {
      for (const row of db.prepare(`SELECT * FROM ${table} WHERE trip_id=?`).all(tripId)) {
        db.prepare(
          `INSERT INTO ${table}(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(newId(table.slice(0, 3)), newTripId, row.data, 1, timestamp, timestamp, user.id, user.id);
      }
    }
    audit(newTripId, user.id, "trip.duplicated", "trip", newTripId, { sourceTripId: tripId });
  });
  return json({ tripId: newTripId }, 201);
}

async function importTripData(request, user, tripId) {
  if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  authorize(user.id, tripId, PERMISSIONS.TRIP_EDIT);
  const input = await body(request);
  const timestamp = now();
  let count = 0;
  transaction(() => {
    for (const [collection, table] of Object.entries(ENTITY_TABLES)) {
      for (const source of input[collection] || []) {
        const data = cleanEntity(source);
        delete data.id;
        delete data.tripId;
        validateEntity(collection, data);
        db.prepare(
          `INSERT INTO ${table}(id,trip_id,data,version,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(newId(collection.slice(0, 3)), tripId, JSON.stringify(data), 1, timestamp, timestamp, user.id, user.id);
        count++;
      }
    }
    audit(tripId, user.id, "trip.imported", "trip", tripId, { entityCount: count });
  });
  emit(tripId, user, "trip.imported", "trips", tripId);
  return json({ imported: count });
}

function readTrip(row) {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    country: row.country,
    startDate: row.start_date,
    endDate: row.end_date,
    travelers: row.travelers,
    budget: row.budget,
    currency: row.currency,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    role: row.role,
    memberCount: row.member_count,
  };
}
function readEntity(row) {
  return {
    ...JSON.parse(row.data),
    id: row.id,
    tripId: row.trip_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    joinedAt: row.joined_at,
    invitedBy: row.invited_by,
    permissions: permissionsForRole(row.role),
  };
}
function listMembers(tripId) {
  return db.prepare(
    `SELECT ${userSelect},tm.role,tm.joined_at,tm.invited_by FROM trip_members tm JOIN users u ON u.id=tm.user_id WHERE tm.trip_id=? ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,u.name`,
  ).all(tripId).map((row) => ({
    user: publicUser(row),
    role: row.role,
    joinedAt: row.joined_at,
    invitedBy: row.invited_by,
  }));
}
function listLogs(tripId) {
  return db.prepare(
    "SELECT l.*,u.name user_name,u.avatar_url FROM trip_activity_logs l LEFT JOIN users u ON u.id=l.user_id WHERE l.trip_id=? ORDER BY l.created_at DESC LIMIT 50",
  ).all(tripId).map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    userName: row.user_name || "Usuario eliminado",
    avatarUrl: row.avatar_url || "",
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
  }));
}
function listInvitations(tripId) {
  return db.prepare(
    "SELECT i.*,u.name creator_name FROM trip_invitations i JOIN users u ON u.id=i.created_by WHERE i.trip_id=? ORDER BY i.created_at DESC",
  ).all(tripId).map(readInvitation);
}
function readInvitation(row) {
  const status = row.revoked_at
    ? "revoked"
    : row.expires_at <= now()
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
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    status,
    version: row.version,
  };
}
function invitationByHash(hash) {
  return db.prepare(
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
  if (row.expires_at <= now()) throw new HttpError(410, "INVITATION_EXPIRED", "La invitación ha caducado.");
  if (row.uses >= row.max_uses) {
    throw new HttpError(410, "INVITATION_USED", "La invitación ha alcanzado su número máximo de usos.");
  }
}
function audit(tripId, userId, action, entityType, entityId, metadata) {
  db.prepare(
    "INSERT INTO trip_activity_logs(id,trip_id,user_id,action,entity_type,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(newId("log"), tripId, userId, action, entityType, entityId, JSON.stringify(metadata || {}), now());
}
function emit(tripId, user, action, collection, entityId) {
  publish(tripId, { action, collection, entityId, user: { id: user.id, name: user.name }, at: now() });
}
function entityTitle(collection, item) {
  return item.title || item.name || item.product ||
    ({ expenses: "Gasto", documents: "Documento", inspirations: "Inspiración" })[collection] || "Elemento";
}

function assertUniqueInspiration(tripId, url, excludedId = "") {
  const duplicate = db.prepare(
    "SELECT id FROM inspirations WHERE trip_id=? AND json_extract(data, '$.url')=? AND id<>?",
  ).get(tripId, url, excludedId);
  if (duplicate) throw new HttpError(409, "INSPIRATION_EXISTS", "Este enlace ya está guardado en el viaje.");
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
}
function validateEntity(collection, data) {
  if (Object.keys(data).length > 60) {
    throw new HttpError(422, "INVALID_ENTITY", "El elemento contiene demasiados campos.");
  }
  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.length > 10_000) {
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
    documents: ["name"],
    inspirations: ["url"],
  }[collection] || [];
  if (required.some((field) => !String(data[field] || "").trim())) {
    throw new HttpError(422, "MISSING_FIELDS", "Faltan campos obligatorios.");
  }
  if (collection === "activities" && data.end <= data.start) {
    throw new HttpError(422, "INVALID_TIME", "La hora final debe ser posterior a la inicial.");
  }
  if (collection === "inspirations") {
    if (Object.keys(data).some((field) => field !== "url")) {
      throw new HttpError(422, "INVALID_INSPIRATION", "Las inspiraciones solo pueden guardar el enlace.");
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
  }
  for (
    const field of ["amount", "estimatedAmount", "actualAmount", "estimatedPrice", "actualPrice", "maxBudget", "price"]
  ) {
    if (data[field] !== undefined && (!Number.isFinite(Number(data[field])) || Number(data[field]) < 0)) {
      throw new HttpError(422, "INVALID_AMOUNT", "Los importes deben ser números positivos.");
    }
  }
  if (collection === "funds" && Number(data.amount) <= 0) {
    throw new HttpError(422, "INVALID_AMOUNT", "La aportación debe ser mayor que cero.");
  }
}
function diff(before, after) {
  const ignored = new Set(["id", "tripId", "version", "createdAt", "updatedAt", "createdBy", "updatedBy"]);
  return Object.fromEntries(
    Object.keys(after).filter((key) => !ignored.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => [key, { from: before[key] ?? null, to: after[key] ?? null }]),
  );
}
