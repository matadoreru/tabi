import { db } from "./database.js";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto.js";
import { CONFIG } from "./config.js";
import { cookies, HttpError, newId, now, sessionCookie } from "./http.js";

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
  if (password.length < 6 || password.length > 200) {
    throw new HttpError(422, "WEAK_PASSWORD", "La contraseña debe tener entre 6 y 200 caracteres.");
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
  db.prepare(
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
  return createSession(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

export async function login(input) {
  const identity = String(input.identifier || input.email || "").trim().toLowerCase();
  const { password } = validateCredentials({ password: input.password });
  if (!identity || identity.length > 254) {
    throw new HttpError(422, "INVALID_IDENTITY", "Introduce tu usuario o email.");
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE")
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
  db.prepare("INSERT INTO sessions(id,token_hash,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?,?)")
    .run(newId("ses"), tokenHash, user.id, timestamp, expiresAt, timestamp);
  return { user: publicUser(user), token, expiresAt };
}

export async function currentUser(request, required = true) {
  const token = cookies(request)[CONFIG.sessionCookie];
  if (!token) {
    if (required) throw new HttpError(401, "AUTH_REQUIRED", "Debes iniciar sesión.");
    return null;
  }
  const row = db.prepare(
    "SELECT u.*, s.id AS session_id, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
  ).get(await sha256(token), now());
  if (!row) {
    if (required) throw new HttpError(401, "SESSION_EXPIRED", "La sesión ha caducado.");
    return null;
  }
  db.prepare("UPDATE sessions SET last_seen_at=? WHERE id=?").run(now(), row.session_id);
  return { ...publicUser(row), sessionId: row.session_id };
}

export async function logout(request) {
  const token = cookies(request)[CONFIG.sessionCookie];
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(await sha256(token));
}

export async function changePassword(user, input) {
  const row = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  if (!await verifyPassword(String(input.currentPassword || ""), row)) {
    throw new HttpError(422, "WRONG_PASSWORD", "La contraseña actual no es correcta.");
  }
  validateCredentials({ email: row.email, password: input.newPassword });
  const passwordRecord = await hashPassword(input.newPassword);
  db.prepare("UPDATE users SET password_hash=?,password_salt=?,password_algorithm=?,updated_at=? WHERE id=?")
    .run(passwordRecord.hash, passwordRecord.salt, passwordRecord.algorithm, now(), user.id);
  db.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").run(user.id, user.sessionId);
}

export function authCookie(result) {
  return sessionCookie(result.token, CONFIG.sessionDays * 86400);
}
export function clearAuthCookie() {
  return sessionCookie("", 0);
}
