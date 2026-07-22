import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { parse, serialize } from "cookie";
import type { NextFunction, Request, Response } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";

const COOKIE_NAME = "yard_tracker_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const passphraseSchema = z.object({ passphrase: z.string().min(6).max(200) });
const loginFailures = new Map<string, { count: number; windowStartedAt: number }>();

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function derivePassphrase(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function configured(sqlite: Database.Database): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM household_auth WHERE id = 1").get());
}

function readSessionToken(request: Request): string | null {
  const cookies = parse(request.headers.cookie ?? "");
  return cookies[COOKIE_NAME] ?? null;
}

export function hasValidSession(sqlite: Database.Database, request: Request): boolean {
  const token = readSessionToken(request);
  if (!token) return false;
  const now = Date.now();
  const session = sqlite
    .prepare("SELECT id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?")
    .get(tokenHash(token), now) as { id: string } | undefined;
  if (!session) return false;
  sqlite.prepare("UPDATE auth_sessions SET last_used_at = ? WHERE id = ?").run(now, session.id);
  return true;
}

function setSessionCookie(sqlite: Database.Database, response: Response, secure: boolean): void {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  sqlite.prepare(
    "INSERT INTO auth_sessions (id, token_hash, expires_at, last_used_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(nanoid(), tokenHash(token), now + SESSION_DURATION_MS, now, now);
  response.append(
    "Set-Cookie",
    serialize(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    }),
  );
}

function clearSessionCookie(response: Response, secure: boolean): void {
  response.append("Set-Cookie", serialize(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 }));
}

function requestIsSecure(request: Request): boolean {
  return request.secure || request.headers["x-forwarded-proto"] === "https";
}

export function requireSession(sqlite: Database.Database) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!configured(sqlite)) {
      response.status(428).json({ error: "Household login has not been configured" });
      return;
    }
    if (!hasValidSession(sqlite, request)) {
      response.status(401).json({ error: "Household login required" });
      return;
    }
    next();
  };
}

export function registerAuthRoutes(app: import("express").Express, sqlite: Database.Database): void {
  app.get("/api/auth/status", (request, response) => {
    const isConfigured = configured(sqlite);
    response.json({ configured: isConfigured, authenticated: isConfigured && hasValidSession(sqlite, request) });
  });

  app.post("/api/auth/setup", (request, response) => {
    if (configured(sqlite)) {
      response.status(409).json({ error: "Household login is already configured" });
      return;
    }
    const parsed = passphraseSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Use a household passphrase with at least 6 characters" });
      return;
    }
    const salt = crypto.randomBytes(16);
    const hash = derivePassphrase(parsed.data.passphrase, salt);
    sqlite.prepare("INSERT INTO household_auth (id, passphrase_salt, passphrase_hash) VALUES (1, ?, ?)").run(salt.toString("base64"), hash.toString("base64"));
    setSessionCookie(sqlite, response, requestIsSecure(request));
    response.status(201).json({ configured: true, authenticated: true });
  });

  app.post("/api/auth/login", (request, response) => {
    const failureKey = request.ip || request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const priorFailure = loginFailures.get(failureKey);
    if (priorFailure && now - priorFailure.windowStartedAt < LOGIN_WINDOW_MS && priorFailure.count >= MAX_LOGIN_FAILURES) {
      response.status(429).json({ error: "Too many attempts. Wait five minutes and try again" });
      return;
    }
    if (priorFailure && now - priorFailure.windowStartedAt >= LOGIN_WINDOW_MS) loginFailures.delete(failureKey);
    const parsed = passphraseSchema.safeParse(request.body);
    const auth = sqlite.prepare("SELECT passphrase_salt AS salt, passphrase_hash AS hash FROM household_auth WHERE id = 1").get() as
      | { salt: string; hash: string }
      | undefined;
    if (!parsed.success || !auth) {
      const failure = loginFailures.get(failureKey);
      loginFailures.set(failureKey, failure ? { ...failure, count: failure.count + 1 } : { count: 1, windowStartedAt: now });
      response.status(401).json({ error: "That household passphrase did not match" });
      return;
    }
    const actual = derivePassphrase(parsed.data.passphrase, Buffer.from(auth.salt, "base64"));
    const expected = Buffer.from(auth.hash, "base64");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      const failure = loginFailures.get(failureKey);
      loginFailures.set(failureKey, failure ? { ...failure, count: failure.count + 1 } : { count: 1, windowStartedAt: now });
      response.status(401).json({ error: "That household passphrase did not match" });
      return;
    }
    loginFailures.delete(failureKey);
    sqlite.prepare("DELETE FROM auth_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").run(Date.now());
    setSessionCookie(sqlite, response, requestIsSecure(request));
    response.json({ configured: true, authenticated: true });
  });

  app.post("/api/auth/logout", (request, response) => {
    const token = readSessionToken(request);
    if (token) sqlite.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?").run(Date.now(), tokenHash(token));
    clearSessionCookie(response, requestIsSecure(request));
    response.status(204).end();
  });
}
