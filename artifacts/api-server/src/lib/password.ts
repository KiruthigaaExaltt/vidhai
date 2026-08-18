import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const PASSWORD_SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  return bcrypt.compare(password, stored);
}

export function temporaryPassword(): string {
  return `${randomBytes(6).toString("base64url")}aA1!`;
}
