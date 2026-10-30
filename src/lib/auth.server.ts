// Username/password accounts stored in the JSON file database, sessions in an httpOnly cookie.
import { deleteCookie, getCookie, getRequestHeader, getRequestUrl, setCookie } from "@tanstack/react-start/server";
import { readDb, withDb, type User } from "./filedb.server";

const COOKIE = "gr_session";
const SESSION_DAYS = 30;
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100_000 }, key, 256);
  return hex(bits);
}
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)).buffer);

function isHttps() {
  const proto = getRequestHeader("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim() === "https";
  return getRequestUrl().protocol === "https:";
}

async function startSession(userId: string) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  await withDb((db) => {
    db.sessions = db.sessions.filter((s) => s.expires > Date.now());
    db.sessions.push({ tokenHash, userId, expires: Date.now() + SESSION_DAYS * 864e5 });
  });
  setCookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isHttps(), path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function registerUser(username: string, password: string) {
  const salt = randomHex(16);
  const passHash = await hashPassword(password, salt);
  const user = await withDb((db) => {
    if (db.users.some((u) => u.username === username)) throw new Error("USERNAME_TAKEN");
    const u: User = { id: crypto.randomUUID(), username, passHash, salt, balance: 0, isAdmin: false, createdAt: new Date().toISOString() };
    db.users.push(u);
    return u;
  });
  await startSession(user.id);
  return user;
}

export async function loginUser(username: string, password: string) {
  const db = await readDb();
  const u = db.users.find((x) => x.username === username);
  if (!u || (await hashPassword(password, u.salt)) !== u.passHash) throw new Error("INVALID_LOGIN");
  await startSession(u.id);
  return u;
}

export async function currentUser(): Promise<User | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const db = await readDb();
  const s = db.sessions.find((x) => x.tokenHash === tokenHash && x.expires > Date.now());
  return s ? (db.users.find((u) => u.id === s.userId) ?? null) : null;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new Error("Not signed in. Please sign in again.");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (!u.isAdmin) throw new Error("Forbidden: administrator access required");
  return u;
}

export async function logoutUser() {
  const token = getCookie(COOKIE);
  if (token) {
    const tokenHash = await sha256(token);
    await withDb((db) => {
      db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash);
    });
  }
  deleteCookie(COOKIE, { path: "/" });
}

/** First administrator: only when no admin exists yet. */
export function makeFirstAdmin(userId: string) {
  return withDb((db) => {
    if (db.users.some((u) => u.isAdmin)) throw new Error("An administrator already exists");
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new Error("User not found");
    u.isAdmin = true;
  });
}
