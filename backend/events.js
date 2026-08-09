const clients = new Map();
const encoder = new TextEncoder();

export function publish(tripId, event) {
  const payload = encoder.encode(`event: trip-change\ndata: ${JSON.stringify(event)}\n\n`);
  for (const controller of clients.get(tripId) || []) {
    try {
      controller.enqueue(payload);
    } catch {
      clients.get(tripId)?.delete(controller);
    }
  }
}

export function eventStream(tripId, signal) {
  let heartbeat;
  const stream = new ReadableStream({
    start(controller) {
      if (!clients.has(tripId)) clients.set(tripId, new Set());
      clients.get(tripId).add(controller);
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ tripId })}\n\n`));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25000);
      signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        clients.get(tripId)?.delete(controller);
        try {
          controller.close();
        } catch { /* closed */ }
      });
    },
    cancel() {
      clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}
