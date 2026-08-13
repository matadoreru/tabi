import {
  authCookie,
  changePassword,
  clearAuthCookie,
  currentUser,
  generateRecoveryCodes,
  listSessions,
  login,
  logout,
  register,
  resetPasswordWithRecoveryCode,
  revokeOtherSessions,
  revokeSession,
} from "./auth.js";
import { body, HttpError, json } from "./http.js";
import { clearRateLimit, enforceRateLimit } from "./rate-limit.js";

export async function authRoutes(request, parts) {
  if (parts[0] === "register" && request.method === "POST") {
    enforceRateLimit(request, "register", { limit: 5, windowMs: 15 * 60_000 });
    const result = await register(await body(request));
    return json({ user: result.user }, 201, { "set-cookie": authCookie(result) });
  }
  if (parts[0] === "login" && request.method === "POST") {
    enforceRateLimit(request, "login", { limit: 10, windowMs: 15 * 60_000 });
    const result = await login(await body(request));
    clearRateLimit(request, "login");
    return json({ user: result.user }, 200, { "set-cookie": authCookie(result) });
  }
  if (parts[0] === "logout" && request.method === "POST") {
    await logout(request);
    return json({ ok: true }, 200, { "set-cookie": clearAuthCookie() });
  }
  if (parts[0] === "password" && request.method === "PATCH") {
    const user = await currentUser(request);
    await changePassword(user, await body(request));
    return json({ ok: true });
  }
  if (parts[0] === "recovery-codes" && request.method === "POST") {
    const user = await currentUser(request);
    return json(await generateRecoveryCodes(user), 201);
  }
  if (parts[0] === "recover" && request.method === "POST") {
    enforceRateLimit(request, "recover", { limit: 5, windowMs: 30 * 60_000 });
    await resetPasswordWithRecoveryCode(await body(request));
    clearRateLimit(request, "recover");
    return json({ ok: true });
  }
  if (parts[0] === "sessions") {
    const user = await currentUser(request);
    if (request.method === "GET") return json({ sessions: await listSessions(user) });
    if (request.method === "DELETE" && parts[1]) {
      await revokeSession(user, parts[1]);
      return json({ ok: true });
    }
    if (request.method === "POST" && parts[1] === "revoke-others") {
      await revokeOtherSessions(user);
      return json({ ok: true });
    }
  }
  throw new HttpError(404, "NOT_FOUND", "Ruta de autenticación no encontrada.");
}
