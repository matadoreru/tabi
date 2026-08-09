import { api } from "./backend/api.js";
import { handleError, HttpError } from "./backend/http.js";

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
  try {
    if (url.pathname.startsWith("/api/")) return await api(request, url.pathname);
    return await staticFile(request, url.pathname);
  } catch (error) {
    return handleError(error);
  }
});

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
