import { db } from "./database.js";
import { HttpError } from "./http.js";
import { permissionsForRole, roleCan } from "../src/permissions.js";

export function membership(userId, tripId) {
  return db.prepare(
    "SELECT tm.*, u.name, u.email, u.avatar_url FROM trip_members tm JOIN users u ON u.id=tm.user_id WHERE tm.user_id=? AND tm.trip_id=?",
  ).get(userId, tripId);
}

export function authorize(userId, tripId, permission) {
  const member = membership(userId, tripId);
  if (!member) throw new HttpError(404, "TRIP_NOT_FOUND", "No existe el viaje o no tienes acceso.");
  if (!roleCan(member.role, permission)) {
    throw new HttpError(403, "FORBIDDEN", "No tienes permiso para realizar esta acción.");
  }
  return { ...member, permissions: permissionsForRole(member.role) };
}

export function assertResourceInTrip(table, resourceId, tripId) {
  const resource = db.prepare(`SELECT * FROM ${table} WHERE id=? AND trip_id=?`).get(resourceId, tripId);
  if (!resource) throw new HttpError(404, "RESOURCE_NOT_FOUND", "El recurso no existe en este viaje.");
  return resource;
}
