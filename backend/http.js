import { CONFIG } from "./config.js";

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function body(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > CONFIG.maxBodyBytes) throw new HttpError(413, "BODY_TOO_LARGE", "La petición es demasiado grande.");
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > CONFIG.maxBodyBytes) {
      throw new HttpError(413, "BODY_TOO_LARGE", "La petición es demasiado grande.");
    }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_JSON", "El cuerpo JSON no es válido.");
  }
}

export function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "").split(";").map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter((
      [key],
    ) => key),
  );
}

export function sessionCookie(token, maxAge) {
  const secure = Deno.env.get("TABI_SECURE_COOKIE") === "true" ? "; Secure" : "";
  return `${CONFIG.sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function validateMutationOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expectedOrigin = CONFIG.publicOrigin || new URL(request.url).origin;
  if (origin && origin !== expectedOrigin) {
    throw new HttpError(403, "BAD_ORIGIN", "Origen de la petición no permitido.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "BAD_ORIGIN", "Petición entre sitios no permitida.");
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new HttpError(415, "JSON_REQUIRED", "Se requiere content-type application/json.");
  }
}

export function handleError(error) {
  if (error instanceof HttpError) {
    return json({ error: { code: error.code, message: error.message, details: error.details } }, error.status);
  }
  if (String(error?.message).includes("UNIQUE constraint failed: users.email")) {
    return json({ error: { code: "EMAIL_TAKEN", message: "Ya existe una cuenta con ese email." } }, 409);
  }
  if (String(error?.message).includes("UNIQUE constraint failed: users.username")) {
    return json({ error: { code: "USERNAME_TAKEN", message: "Ese nombre de usuario ya está en uso." } }, 409);
  }
  console.error(error);
  return json({ error: { code: "INTERNAL_ERROR", message: "Ha ocurrido un error inesperado." } }, 500);
}

export const now = () => new Date().toISOString();
export const newId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
