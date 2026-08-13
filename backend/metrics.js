const startedAt = Date.now();
const counters = new Map();
let totalDurationMs = 0;

export function recordRequest(method, path, status, durationMs) {
  const route = path.replace(
    /\/(?:trip|act|pla|pur|exp|sta|tra|res|tas|not|ins|fun|rem|com|rte|usr|inv)_[A-Za-z0-9_-]+/g,
    "/:id",
  );
  const key = `${method}|${route}|${status}`;
  counters.set(key, (counters.get(key) || 0) + 1);
  totalDurationMs += durationMs;
}

export function prometheusMetrics() {
  const lines = [
    "# HELP tabi_uptime_seconds Process uptime.",
    "# TYPE tabi_uptime_seconds gauge",
    `tabi_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
    "# HELP tabi_http_requests_total HTTP requests.",
    "# TYPE tabi_http_requests_total counter",
  ];
  for (const [key, value] of counters) {
    const [method, route, status] = key.split("|");
    lines.push(`tabi_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`);
  }
  lines.push(
    "# HELP tabi_http_request_duration_milliseconds_total Accumulated request duration.",
    "# TYPE tabi_http_request_duration_milliseconds_total counter",
    `tabi_http_request_duration_milliseconds_total ${Math.round(totalDurationMs)}`,
  );
  return `${lines.join("\n")}\n`;
}

export function uptimeSeconds() {
  return Math.floor((Date.now() - startedAt) / 1000);
}
