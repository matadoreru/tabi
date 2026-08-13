import { enforceRateLimit } from "./rate-limit.js";

Deno.test("limita intentos de autenticación por origen", () => {
  const request = new Request("https://tabi.example/api/auth/login", {
    headers: { "x-real-ip": `test-${crypto.randomUUID()}` },
  });
  enforceRateLimit(request, "test", { limit: 2, windowMs: 60_000 });
  enforceRateLimit(request, "test", { limit: 2, windowMs: 60_000 });
  let code = "";
  try {
    enforceRateLimit(request, "test", { limit: 2, windowMs: 60_000 });
  } catch (error) {
    code = error.code;
  }
  if (code !== "RATE_LIMITED") throw new Error("El tercer intento debía quedar bloqueado.");
});
