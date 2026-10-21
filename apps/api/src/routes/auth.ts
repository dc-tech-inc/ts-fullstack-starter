import { Credentials, type UserResponse } from "@app/shared";
import { Router, type RequestHandler } from "express";
import { clearSessionCookie, getAuth, requireAuth, setSessionCookie } from "../middleware/auth.js";
import type { AuthService } from "../services/auth-service.js";

interface AuthRouterDeps {
  auth: AuthService;
  secureCookies: boolean;
  /** Applied to the credential endpoints (register, login) only. */
  credentialLimiter: RequestHandler;
}

export function authRouter({ auth, secureCookies, credentialLimiter }: AuthRouterDeps): Router {
  const router = Router();

  router.post("/register", credentialLimiter, async (req, res) => {
    const user = await auth.register(Credentials.parse(req.body));
    const { token } = await auth.createSession(user.id);
    setSessionCookie(res, token, secureCookies);
    res.status(201).json({ user } satisfies UserResponse);
  });

  router.post("/login", credentialLimiter, async (req, res) => {
    const user = await auth.login(Credentials.parse(req.body));
    const { token } = await auth.createSession(user.id);
    setSessionCookie(res, token, secureCookies);
    res.json({ user } satisfies UserResponse);
  });

  router.post("/logout", requireAuth(auth), async (_req, res) => {
    await auth.deleteSession(getAuth(res).sessionToken);
    clearSessionCookie(res, secureCookies);
    res.status(204).end();
  });

  router.get("/me", requireAuth(auth), (_req, res) => {
    res.json({ user: getAuth(res).user } satisfies UserResponse);
  });

  return router;
}
