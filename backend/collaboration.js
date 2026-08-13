import { authorize } from "./authorization.js";
import { db, entityTable, transaction } from "./database.js";
import { body, HttpError, json, newId, now } from "./http.js";
import { publish } from "./events.js";
import { PERMISSIONS } from "../src/permissions.js";
import { ENTITY_TABLES } from "./config.js";

const allowedTargets = new Set(Object.keys(ENTITY_TABLES).filter((name) => name !== "reminders"));

function readComment(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    entityCollection: row.entity_collection,
    entityId: row.entity_id,
    body: row.body,
    mentions: Array.isArray(row.mentions) ? row.mentions : JSON.parse(row.mentions || "[]"),
    version: row.version,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    user: {
      id: row.user_id,
      name: row.user_name || "Usuario eliminado",
      username: row.username || "",
      avatarUrl: row.avatar_url || "",
    },
  };
}

async function targetInTrip(tripId, collection, id) {
  if (!allowedTargets.has(collection)) {
    throw new HttpError(422, "INVALID_COMMENT_TARGET", "El tipo de elemento no admite comentarios.");
  }
  if (!await db.prepare(`SELECT 1 FROM ${entityTable(collection)} WHERE trip_id=? AND id=?`).get(tripId, id)) {
    throw new HttpError(404, "COMMENT_TARGET_NOT_FOUND", "El elemento comentado ya no existe.");
  }
}

async function mentionIds(tripId, text) {
  const usernames = [
    ...new Set(
      [...String(text).matchAll(/(^|\s)@([\p{L}\p{N}._-]{3,30})/gu)].map((match) => match[2].toLocaleLowerCase()),
    ),
  ];
  if (!usernames.length) return [];
  const members = await db.prepare(
    "SELECT u.id,u.username FROM trip_members tm JOIN users u ON u.id=tm.user_id WHERE tm.trip_id=?",
  ).all(tripId);
  const byUsername = new Map(members.map((item) => [String(item.username || "").toLocaleLowerCase(), item.id]));
  return usernames.map((username) => byUsername.get(username)).filter(Boolean);
}

export async function commentRoutes(request, user, tripId, id = "") {
  const url = new URL(request.url);
  if (request.method === "GET" && !id) {
    await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    const collection = url.searchParams.get("collection") || "";
    const entityId = url.searchParams.get("entityId") || "";
    if (collection && entityId) await targetInTrip(tripId, collection, entityId);
    const rows = collection && entityId
      ? await db.prepare(
        "SELECT c.*,u.name user_name,u.username,u.avatar_url FROM entity_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.trip_id=? AND c.entity_collection=? AND c.entity_id=? ORDER BY c.created_at",
      ).all(tripId, collection, entityId)
      : await db.prepare(
        "SELECT c.*,u.name user_name,u.username,u.avatar_url FROM entity_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.trip_id=? ORDER BY c.created_at DESC LIMIT 100",
      ).all(tripId);
    return json({ comments: rows.map(readComment) });
  }
  if (request.method === "POST" && !id) {
    await authorize(user.id, tripId, PERMISSIONS.COMMENT_CREATE);
    const input = await body(request);
    const text = String(input.body || "").trim();
    await targetInTrip(tripId, input.entityCollection, input.entityId);
    if (!text || text.length > 2000) {
      throw new HttpError(422, "INVALID_COMMENT", "El comentario debe tener entre 1 y 2000 caracteres.");
    }
    const timestamp = now();
    const commentId = newId("com");
    const mentions = await mentionIds(tripId, text);
    await transaction(async () => {
      await db.prepare(
        "INSERT INTO entity_comments(id,trip_id,entity_collection,entity_id,user_id,body,mentions,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).run(
        commentId,
        tripId,
        input.entityCollection,
        input.entityId,
        user.id,
        text,
        mentions,
        1,
        timestamp,
        timestamp,
      );
      await db.prepare(
        "INSERT INTO trip_activity_logs(id,trip_id,user_id,action,entity_type,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(newId("log"), tripId, user.id, "comment.created", input.entityCollection, input.entityId, {
        title: text.slice(0, 80),
        mentions,
      }, timestamp);
    });
    const row = await db.prepare(
      "SELECT c.*,u.name user_name,u.username,u.avatar_url FROM entity_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.id=?",
    ).get(commentId);
    publish(tripId, {
      action: "comment.created",
      collection: "comments",
      entityId: commentId,
      item: readComment(row),
      user: { id: user.id, name: user.name },
      at: timestamp,
    });
    return json({ comment: readComment(row) }, 201);
  }
  if (request.method === "DELETE" && id) {
    const membership = await authorize(user.id, tripId, PERMISSIONS.TRIP_VIEW);
    const row = await db.prepare("SELECT * FROM entity_comments WHERE id=? AND trip_id=?").get(id, tripId);
    if (!row) throw new HttpError(404, "COMMENT_NOT_FOUND", "Comentario no encontrado.");
    if (
      row.user_id !== user.id && !membership.permissions?.includes?.(PERMISSIONS.COMMENT_MODERATE) &&
      membership.role !== "owner"
    ) {
      throw new HttpError(403, "FORBIDDEN", "No puedes eliminar este comentario.");
    }
    await db.prepare("DELETE FROM entity_comments WHERE id=? AND trip_id=?").run(id, tripId);
    publish(tripId, {
      action: "comment.deleted",
      collection: "comments",
      entityId: id,
      item: null,
      user: { id: user.id, name: user.name },
      at: now(),
    });
    return json({ ok: true });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}

export async function routeEstimateRoutes(request, user, tripId) {
  await authorize(user.id, tripId, request.method === "GET" ? PERMISSIONS.TRIP_VIEW : PERMISSIONS.TRIP_EDIT);
  const url = new URL(request.url);
  const routeKey = request.method === "GET" ? url.searchParams.get("key") : "";
  const mode = request.method === "GET" ? url.searchParams.get("mode") || "WALKING" : "";
  if (request.method === "GET") {
    const row = await db.prepare(
      "SELECT * FROM route_estimates WHERE trip_id=? AND route_key=? AND travel_mode=? AND expires_at>?",
    ).get(tripId, routeKey, mode, now());
    return json({
      estimate: row
        ? {
          routeKey: row.route_key,
          travelMode: row.travel_mode,
          distanceMeters: row.distance_meters,
          durationSeconds: row.duration_seconds,
          provider: row.provider,
          fetchedAt: String(row.fetched_at),
          expiresAt: String(row.expires_at),
        }
        : null,
    });
  }
  if (request.method === "PUT" || request.method === "POST") {
    const input = await body(request);
    if (
      !/^[a-f0-9]{32,64}$/.test(input.routeKey || "") ||
      !["WALKING", "DRIVING", "TRANSIT", "BICYCLING"].includes(input.travelMode) ||
      !Number.isInteger(input.durationSeconds) || input.durationSeconds < 0 ||
      !Number.isInteger(input.distanceMeters) || input.distanceMeters < 0
    ) {
      throw new HttpError(422, "INVALID_ROUTE_ESTIMATE", "La estimación de ruta no es válida.");
    }
    const timestamp = now();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await db.prepare(
      "INSERT INTO route_estimates(id,trip_id,route_key,travel_mode,distance_meters,duration_seconds,provider,fetched_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(trip_id,route_key,travel_mode) DO UPDATE SET distance_meters=excluded.distance_meters,duration_seconds=excluded.duration_seconds,provider=excluded.provider,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at",
    ).run(
      newId("rte"),
      tripId,
      input.routeKey,
      input.travelMode,
      input.distanceMeters,
      input.durationSeconds,
      "google-maps",
      timestamp,
      expiresAt,
    );
    return json({ ok: true, expiresAt });
  }
  throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
}
