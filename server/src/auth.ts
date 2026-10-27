import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { inWorkspace } from "./store.js";

// Demo sign-in: one shared set of credentials (for judges), exchanged for a signed, expiring
// session token. Each sign-in gets its own session id, and with it its own demo workspace. Every /api route except /api/auth/* requires the token, so a public demo URL
// can't be used to spend the Anthropic or PayPal sandbox quota anonymously.

const SECRET = config.auth.secret || crypto.randomBytes(32).toString("hex");
const TTL_MS = 12 * 60 * 60 * 1000;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkCredentials(email: string, password: string): boolean {
  // Compare both fields every time so the response time doesn't hint which one was wrong.
  const emailOk = safeEqual(email.trim().toLowerCase(), config.auth.email.toLowerCase());
  const passwordOk = safeEqual(password, config.auth.password);
  return emailOk && passwordOk;
}

interface Claims {
  sub: string; // the demo account's email
  sid: string; // this sign-in's session, which keys the visitor's workspace
  exp: number;
}

export function issueToken(email: string): string {
  const claims: Claims = { sub: email, sid: crypto.randomUUID(), exp: Date.now() + TTL_MS };
  const payload = b64(JSON.stringify(claims));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): Claims | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims;
    return claims.exp > Date.now() && claims.sid ? claims : null;
  } catch {
    return null;
  }
}

const bearer = (req: Request) => req.headers.authorization?.replace(/^Bearer\s+/i, "");

/**
 * Mounted on /api: lets /api/auth/* and the health check through, rejects everything else without
 * a session, and runs the rest of the request inside that session's demo workspace.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/auth/") || req.path === "/health") return next();
  const claims = verifyToken(bearer(req));
  if (!claims) return void res.status(401).json({ error: "Sign in to use the demo" });
  res.locals.user = claims.sub;
  inWorkspace(claims.sid, next);
}

export function currentUser(req: Request): string | null {
  return verifyToken(bearer(req))?.sub ?? null;
}

// A few attempts per minute per IP is plenty for people and useless for guessing.
const attempts = new Map<string, number[]>();
export function loginRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > 10;
}
