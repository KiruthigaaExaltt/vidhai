import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith("scrypt:")) {
    const [, salt, expected] = stored.split(":");
    const actual = scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expected, "hex");
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  }
  const legacy = createHash("sha256").update(password + "vidhai-salt-2024").digest("hex");
  return legacy === stored;
}

export function temporaryPassword(): string {
  return `${randomBytes(6).toString("base64url")}aA1!`;
}
