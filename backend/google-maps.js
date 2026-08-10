import { HttpError } from "./http.js";

const SHORT_HOST = "maps.app.goo.gl";

export function googleMapsUrl(value) {
  if (String(value || "").length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname === SHORT_HOST) return url;
    if (/^(?:www\.|maps\.)?google\.[a-z.]{2,}$/i.test(url.hostname) && url.pathname.startsWith("/maps")) {
      return url;
    }
  } catch {
    // La validación devuelve null para que la ruta produzca un error de usuario.
  }
  return null;
}

export async function resolveGoogleMapsUrl(value, fetcher = fetch) {
  let url = googleMapsUrl(value);
  if (!url) throw new HttpError(422, "INVALID_MAPS_URL", "Introduce un enlace válido de Google Maps.");
  for (let redirects = 0; url.hostname === SHORT_HOST && redirects < 5; redirects++) {
    let response;
    try {
      response = await fetcher(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new HttpError(502, "MAPS_LINK_UNAVAILABLE", "No se ha podido abrir el enlace de Google Maps.");
    }
    const location = response.headers.get("location");
    response.body?.cancel();
    if (!location) {
      throw new HttpError(422, "INVALID_MAPS_URL", "El enlace corto de Google Maps no contiene un destino válido.");
    }
    url = googleMapsUrl(new URL(location, url).href);
    if (!url) throw new HttpError(422, "INVALID_MAPS_URL", "El enlace redirige fuera de Google Maps.");
  }
  if (url.hostname === SHORT_HOST) {
    throw new HttpError(422, "INVALID_MAPS_URL", "El enlace de Google Maps contiene demasiadas redirecciones.");
  }
  return url.href;
}
