import { HttpError } from "./http.js";

const attempts = new Map();
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function clientAddress(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function sweep(timestamp) {
  if (timestamp - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = timestamp;
  for (const [key, bucket] of attempts) if (bucket.resetAt <= timestamp) attempts.delete(key);
}

export function enforceRateLimit(request, scope, { limit, windowMs }) {
  const timestamp = Date.now();
  sweep(timestamp);
  const key = `${scope}:${clientAddress(request)}`;
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= timestamp) {
    attempts.set(key, { count: 1, resetAt: timestamp + windowMs });
    return;
  }
  bucket.count++;
  if (bucket.count > limit) {
    throw new HttpError(429, "RATE_LIMITED", "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.", {
      retryAfterSeconds: Math.ceil((bucket.resetAt - timestamp) / 1000),
    });
  }
}

export function clearRateLimit(request, scope) {
  attempts.delete(`${scope}:${clientAddress(request)}`);
}
