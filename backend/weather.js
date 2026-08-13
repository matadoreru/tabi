import { HttpError, json } from "./http.js";
import { isValidTimeZone } from "../src/time.js";

const cache = new Map();
const TTL_MS = 30 * 60 * 1000;

export async function weatherRoute(request) {
  if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Método no permitido.");
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  const timeZone = url.searchParams.get("timeZone") || "UTC";
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 ||
    longitude > 180
  ) {
    throw new HttpError(422, "INVALID_COORDINATES", "Coordenadas no válidas.");
  }
  if (!isValidTimeZone(timeZone)) throw new HttpError(422, "INVALID_TIME_ZONE", "Zona horaria no válida.");
  const key = `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${timeZone}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return json({ ...cached.value, cached: true });
  const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
  endpoint.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: timeZone,
    forecast_days: "16",
  });
  let response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  } catch {
    if (cached) return json({ ...cached.value, stale: true });
    throw new HttpError(503, "WEATHER_UNAVAILABLE", "La previsión meteorológica no está disponible.");
  }
  if (!response.ok) throw new HttpError(503, "WEATHER_UNAVAILABLE", "La previsión meteorológica no está disponible.");
  const source = await response.json();
  const days = (source.daily?.time || []).map((date, index) => ({
    date,
    code: source.daily.weather_code[index],
    maximum: source.daily.temperature_2m_max[index],
    minimum: source.daily.temperature_2m_min[index],
    rainProbability: source.daily.precipitation_probability_max[index],
  }));
  const value = { provider: "open-meteo", fetchedAt: new Date().toISOString(), days };
  cache.set(key, { at: Date.now(), value });
  return json(value);
}
