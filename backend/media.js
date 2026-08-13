import { db } from "./database.js";
import { HttpError, newId, now } from "./http.js";

const DATA_IMAGE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MEDIA_FIELDS = Object.freeze({ purchases: ["photo"], places: ["backgroundImage"] });

function matchesImageSignature(mimeType, bytes) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((part, index) => bytes[index] === part);
  }
  return mimeType === "image/webp" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

export async function extractMediaAssets(tripId, collection, ownerId, data, userId) {
  for (const field of MEDIA_FIELDS[collection] || []) {
    const value = data[field];
    if (value === "") {
      await db.prepare(
        "DELETE FROM media_assets WHERE trip_id=? AND owner_collection=? AND owner_id=? AND field_name=?",
      ).run(tripId, collection, ownerId, field);
      delete data[`${field}AssetId`];
      continue;
    }
    if (!value?.startsWith?.("data:")) continue;
    const match = value.match(DATA_IMAGE);
    if (!match) throw new HttpError(422, "INVALID_IMAGE", "La imagen no tiene un formato válido.");
    const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
    if (!bytes.length || bytes.length > 2_000_000) {
      throw new HttpError(413, "IMAGE_TOO_LARGE", "La imagen no puede superar 2 MB.");
    }
    if (!matchesImageSignature(match[1], bytes)) {
      throw new HttpError(422, "INVALID_IMAGE_CONTENT", "El contenido no coincide con el formato de imagen indicado.");
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const contentHash = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
    const existing = await db.prepare(
      "SELECT id FROM media_assets WHERE trip_id=? AND owner_collection=? AND owner_id=? AND field_name=?",
    ).get(tripId, collection, ownerId, field);
    const id = existing?.id || newId("med");
    const timestamp = now();
    await db.prepare(
      `INSERT INTO media_assets(id,trip_id,owner_collection,owner_id,field_name,mime_type,bytes,byte_size,content_hash,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(trip_id,owner_collection,owner_id,field_name) DO UPDATE SET
         mime_type=excluded.mime_type,bytes=excluded.bytes,byte_size=excluded.byte_size,content_hash=excluded.content_hash,updated_at=excluded.updated_at`,
    ).run(
      id,
      tripId,
      collection,
      ownerId,
      field,
      match[1],
      bytes,
      bytes.length,
      contentHash,
      userId,
      timestamp,
      timestamp,
    );
    data[`${field}AssetId`] = id;
    data[field] = `/api/media/${id}`;
  }
}

export async function removeOwnedMedia(tripId, collection, ownerId) {
  await db.prepare("DELETE FROM media_assets WHERE trip_id=? AND owner_collection=? AND owner_id=?")
    .run(tripId, collection, ownerId);
}

export async function mediaResponse(userId, mediaId) {
  const row = await db.prepare(
    `SELECT m.* FROM media_assets m JOIN trip_members tm ON tm.trip_id=m.trip_id
     WHERE m.id=? AND tm.user_id=?`,
  ).get(mediaId, userId);
  if (!row) throw new HttpError(404, "MEDIA_NOT_FOUND", "La imagen no existe.");
  return new Response(row.bytes, {
    headers: {
      "content-type": row.mime_type,
      "content-length": String(row.byte_size),
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
