import { HttpError } from "./http.js";

const SHORT_HOST = "maps.app.goo.gl";
const GOOGLE_PHOTO_NAME = /^places\/[^/?#\s]+\/photos\/[^/?#\s]+$/;

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

export async function googlePlacePhotoResponse(name, apiKey, fetcher = fetch) {
  const photoName = String(name || "").trim();
  if (!GOOGLE_PHOTO_NAME.test(photoName)) {
    throw new HttpError(422, "INVALID_PLACE_PHOTO", "La referencia de la foto de Google Maps no es válida.");
  }
  if (!apiKey) throw new HttpError(503, "MAPS_UNAVAILABLE", "Google Maps no está configurado.");
  const url = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  url.searchParams.set("maxWidthPx", "1200");
  url.searchParams.set("maxHeightPx", "720");
  url.searchParams.set("skipHttpRedirect", "true");
  url.searchParams.set("key", apiKey);
  let upstream;
  try {
    upstream = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new HttpError(502, "PLACE_PHOTO_UNAVAILABLE", "No se ha podido descargar la foto de Google Maps.");
  }
  let payload;
  try {
    payload = upstream.ok ? await upstream.json() : null;
  } catch {
    payload = null;
  }
  let photoUri;
  try {
    photoUri = new URL(payload?.photoUri);
  } catch {
    photoUri = null;
  }
  if (
    !photoUri || photoUri.protocol !== "https:" ||
    !(photoUri.hostname === "googleusercontent.com" || photoUri.hostname.endsWith(".googleusercontent.com"))
  ) {
    throw new HttpError(502, "PLACE_PHOTO_UNAVAILABLE", "Google Maps no ha devuelto una imagen válida.");
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: photoUri.href,
      "cache-control": "private, no-store",
    },
  });
}
