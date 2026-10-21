import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashToken,
  isExpired,
  newSessionToken,
  SESSION_TTL_MS,
  verifyPassword,
} from "../../src/services/auth-service.js";

describe("password hashing", () => {
  it("produces an argon2id hash with the OWASP minimum parameters", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery stable")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password here")).not.toBe(await hashPassword("same password here"));
  });
});

describe("session tokens", () => {
  it("are 32 random bytes encoded as base64url", () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(token);
  });

  it("are stored as a deterministic sha256 hex digest", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });
});

describe("isExpired", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("treats the expiry instant itself as expired", () => {
    expect(isExpired(now, now)).toBe(true);
    expect(isExpired(new Date(now.getTime() - 1), now)).toBe(true);
    expect(isExpired(new Date(now.getTime() + 1), now)).toBe(false);
  });

  it("uses a 24 hour absolute lifetime", () => {
    expect(SESSION_TTL_MS).toBe(86_400_000);
  });
});
