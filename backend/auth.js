import { db, transaction } from "./database.js";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto.js";
import { CONFIG } from "./config.js";
import { cookies, HttpError, newId, now, sessionCookie } from "./http.js";

let lastSessionCleanup = 0;

export function publicUser(row) {
  return row &&
    {
      id: row.id,
      name: row.name,
      username: row.username,
      email: row.email,
      avatarUrl: row.avatar_url || "",
      createdAt: row.created_at,
    };
}

export function validateCredentials(input, registration = false) {
  const email = String(input.email || "").trim().toLowerCase();
  const username = String(input.username || "").trim().toLowerCase();
  const password = String(input.password || "");
  const name = String(input.name || "").trim();
  if (registration && (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)) {
    throw new HttpError(422, "INVALID_EMAIL", "Introduce un email válido.");
  }
  if (!password || password.length > 200 || ((registration || input.enforceStrong) && password.length < 10)) {
    throw new HttpError(422, "WEAK_PASSWORD", "La contraseña debe tener entre 10 y 200 caracteres.");
  }
  if (registration && (name.length < 2 || name.length > 80)) {
    throw new HttpError(422, "INVALID_NAME", "El nombre debe tener entre 2 y 80 caracteres.");
  }
  if (registration && !/^[\p{L}\p{N}._-]{3,30}$/u.test(username)) {
    throw new HttpError(
      422,
      "INVALID_USERNAME",
      "El usuario debe tener entre 3 y 30 caracteres y solo puede incluir letras, números, punto, guion o guion bajo.",
    );
  }
  return { email, username, password, name };
}

export async function register(input) {
  const { email, username, password, name } = validateCredentials(input, true);
  const passwordRecord = await hashPassword(password);
  const timestamp = now();
  const id = newId("usr");
  await db.prepare(
    "INSERT INTO users(id,name,username,email,password_hash,password_salt,password_algorithm,avatar_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .run(
      id,
      name,
      username,
      email,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.algorithm,
      input.avatarUrl || null,
      timestamp,
      timestamp,
    );
  return createSession(await db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

export async function login(input) {
  const identity = String(input.identifier || input.email || "").trim().toLowerCase();
  const { password } = validateCredentials({ password: input.password });
  if (!identity || identity.length > 254) {
    throw new HttpError(422, "INVALID_IDENTITY", "Introduce tu usuario o email.");
  }
  const user = await db.prepare("SELECT * FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)")
    .get(identity, identity);
  if (!user || !(await verifyPassword(password, user))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Usuario, email o contraseña incorrectos.");
  }
  return createSession(user);
}

async function createSession(user) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const timestamp = now();
  const expiresAt = new Date(Date.now() + CONFIG.sessionDays * 86400000).toISOString();
  await db.prepare(
    "INSERT INTO sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?,?)",
  )
    .run(newId("ses"), tokenHash, user.id, timestamp, expiresAt, timestamp);
  return { user: publicUser(user), token, expiresAt };
}

export async function currentUser(request, required = true) {
  if (Date.now() - lastSessionCleanup > 60 * 60_000) {
    lastSessionCleanup = Date.now();
    await db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now());
    await db.prepare("DELETE FROM account_recovery_codes WHERE expires_at<=? OR used_at IS NOT NULL").run(now());
  }
  const token = cookies(request)[CONFIG.sessionCookie];
  if (!token) {
    if (required) throw new HttpError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    return null;
  }
  const row = await db.prepare(
    "SELECT u.*, s.id AS session_id, s.expires_at,s.last_seen_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
  ).get(await sha256(token), now());
  if (!row) {
    if (required) throw new HttpError(401, "SESSION_EXPIRED", "La sesión ha caducado.");
    return null;
  }
  if (Date.now() - Date.parse(row.last_seen_at) > 15 * 60_000) {
    await db.prepare("UPDATE sessions SET last_seen_at=? WHERE id=?").run(now(), row.session_id);
  }
  return { ...publicUser(row), sessionId: row.session_id };
}

export async function logout(request) {
  const token = cookies(request)[CONFIG.sessionCookie];
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(await sha256(token));
}

export async function changePassword(user, input) {
  const row = await db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  if (!await verifyPassword(String(input.currentPassword || ""), row)) {
    throw new HttpError(422, "WRONG_PASSWORD", "La contraseña actual no es correcta.");
  }
  validateCredentials({ email: row.email, password: input.newPassword, enforceStrong: true });
  const passwordRecord = await hashPassword(input.newPassword);
  await db.prepare("UPDATE users SET password_hash=?,password_salt=?,password_algorithm=?,updated_at=? WHERE id=?")
    .run(passwordRecord.hash, passwordRecord.salt, passwordRecord.algorithm, now(), user.id);
  await db.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").run(user.id, user.sessionId);
}

export async function listSessions(user) {
  return (await db.prepare(
    "SELECT id,created_at,last_seen_at,expires_at FROM sessions WHERE user_id=? ORDER BY last_seen_at DESC",
  ).all(user.id)).map((row) => ({
    id: row.id,
    current: row.id === user.sessionId,
    createdAt: String(row.created_at),
    lastSeenAt: String(row.last_seen_at),
    expiresAt: String(row.expires_at),
  }));
}

export async function revokeSession(user, sessionId) {
  if (sessionId === user.sessionId) {
    throw new HttpError(422, "CURRENT_SESSION", "Cierra sesión para revocar la sesión actual.");
  }
  await db.prepare("DELETE FROM sessions WHERE id=? AND user_id=?").run(sessionId, user.id);
}

export async function revokeOtherSessions(user) {
  await db.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").run(user.id, user.sessionId);
}

export async function generateRecoveryCodes(user) {
  const codes = Array.from({ length: 8 }, () => randomToken(9));
  const timestamp = now();
  const expiresAt = new Date(Date.now() + 365 * 86400000).toISOString();
  const hashes = await Promise.all(codes.map((code) => sha256(code)));
  await transaction(async () => {
    await db.prepare("DELETE FROM account_recovery_codes WHERE user_id=?").run(user.id);
    for (let index = 0; index < codes.length; index++) {
      await db.prepare(
        "INSERT INTO account_recovery_codes(id,user_id,code_hash,created_at,expires_at) VALUES (?,?,?,?,?)",
      ).run(newId("rec"), user.id, hashes[index], timestamp, expiresAt);
    }
  });
  return { codes, expiresAt };
}

export async function resetPasswordWithRecoveryCode(input) {
  const identity = String(input.identifier || "").trim().toLowerCase();
  const codeHash = await sha256(String(input.recoveryCode || "").trim());
  validateCredentials({ password: input.newPassword, enforceStrong: true });
  const row = await db.prepare(
    `SELECT c.id code_id,u.* FROM account_recovery_codes c JOIN users u ON u.id=c.user_id
     WHERE c.code_hash=? AND c.used_at IS NULL AND c.expires_at>? AND
       (lower(u.email)=lower(?) OR lower(u.username)=lower(?))`,
  ).get(codeHash, now(), identity, identity);
  if (!row) throw new HttpError(422, "INVALID_RECOVERY_CODE", "El usuario o código de recuperación no es válido.");
  const passwordRecord = await hashPassword(input.newPassword);
  const timestamp = now();
  await transaction(async () => {
    const consumed = await db.prepare(
      "UPDATE account_recovery_codes SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?",
    ).run(timestamp, row.code_id, timestamp);
    if (!consumed.changes) {
      throw new HttpError(422, "INVALID_RECOVERY_CODE", "El usuario o código de recuperación no es válido.");
    }
    await db.prepare("UPDATE users SET password_hash=?,password_salt=?,password_algorithm=?,updated_at=? WHERE id=?")
      .run(passwordRecord.hash, passwordRecord.salt, passwordRecord.algorithm, timestamp, row.id);
    await db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
  });
}

export function authCookie(result) {
  return sessionCookie(result.token, CONFIG.sessionDays * 86400);
}
export function clearAuthCookie() {
  return sessionCookie("", 0);
}
