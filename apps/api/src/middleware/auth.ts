import type { PublicUser } from "@app/shared";
import type { RequestHandler, Response } from "express";
import { SESSION_TTL_MS, type AuthService } from "../services/auth-service.js";
import { unauthorized } from "./error-handler.js";

export const SESSION_COOKIE = "sid";

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure, path: "/" });
}

interface AuthLocals {
  user: PublicUser;
  sessionToken: string;
}

/** Rejects the request with 401 unless the `sid` cookie maps to a live session. */
export function requireAuth(auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    const sessionToken = readCookie(req.headers.cookie, SESSION_COOKIE);
    const user = sessionToken ? await auth.resolveSession(sessionToken) : null;
    if (!user || !sessionToken) throw unauthorized();
    res.locals.auth = { user, sessionToken } satisfies AuthLocals;
    next();
  };
}

export function getAuth(res: Response): AuthLocals {
  const auth = res.locals.auth as AuthLocals | undefined;
  if (!auth) throw new Error("getAuth() called on a route without requireAuth");
  return auth;
}
