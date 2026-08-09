import { CONFIG } from "./config.js";

const encoder = new TextEncoder();

export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64Url(data);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export async function hashPassword(password, salt = randomToken(16)) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: CONFIG.passwordIterations },
    key,
    256,
  );
  return { salt, hash: toBase64Url(new Uint8Array(bits)), algorithm: `pbkdf2-sha256:${CONFIG.passwordIterations}` };
}

export async function verifyPassword(password, record) {
  const result = await hashPassword(password, record.password_salt);
  return timingSafeEqual(result.hash, record.password_hash);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
