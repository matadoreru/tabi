import { api } from "./backend/api.js";
import { handleError, HttpError } from "./backend/http.js";
import { recordRequest } from "./backend/metrics.js";

const root = new URL("./", import.meta.url);
const port = Number(Deno.env.get("PORT") || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
};

Deno.serve({ port }, async (request) => {
  const url = new URL(request.url);
  const startedAt = performance.now();
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  let response;
  try {
    response = url.pathname.startsWith("/api/")
      ? await api(request, url.pathname)
      : await staticFile(request, url.pathname);
  } catch (error) {
    response = handleError(error);
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        code: error?.code || "INTERNAL_ERROR",
        message: error?.message || "Error interno",
      }),
    );
  }
  const durationMs = performance.now() - startedAt;
  recordRequest(request.method, url.pathname, response.status, durationMs);
  if (url.pathname.startsWith("/api/")) {
    console.log(
      JSON.stringify({
        level: "info",
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Math.round(durationMs),
      }),
    );
  }
  response.headers.set("x-request-id", requestId);
  return securityHeaders(response, request);
});

function securityHeaders(response, request) {
  const headers = new Headers(response.headers);
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(self)");
  headers.set("x-frame-options", "DENY");
  headers.set("cross-origin-opener-policy", "same-origin");
  if (new URL(request.url).protocol === "https:" || Deno.env.get("TABI_PUBLIC_ORIGIN")?.startsWith("https://")) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function staticFile(request, pathname) {
  if (!["GET", "HEAD"].includes(request.method)) throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  let requested = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  if (!requested.split("/").at(-1).includes(".")) requested = "/index.html";
  const candidate = new URL(`.${requested}`, root);
  if (!candidate.href.startsWith(root.href) || requested.startsWith("/backend/") || requested.startsWith("/data/")) {
    throw new HttpError(403, "FORBIDDEN", "Acceso no permitido.");
  }
  try {
    const file = await Deno.readFile(candidate);
    const extension = requested.slice(requested.lastIndexOf("."));
    return new Response(request.method === "HEAD" ? null : file, {
      headers: {
        "content-type": types[extension] || "application/octet-stream",
        "cache-control": requested === "/index.html" ? "no-cache" : "public, max-age=300",
        "x-content-type-options": "nosniff",
        "referrer-policy": "same-origin",
        "content-security-policy":
          "default-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; worker-src 'self' blob:; base-uri 'self'; frame-ancestors 'none'",
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) throw new HttpError(404, "NOT_FOUND", "Archivo no encontrado.");
    throw error;
  }
}
