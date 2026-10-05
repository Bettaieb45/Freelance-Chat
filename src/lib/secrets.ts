import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const PASSCODE_LENGTH = 6;
export const MAX_PASSCODE_ATTEMPTS = 5;
export const PASSCODE_LOCK_MINUTES = 15;

/** Unguessable URL token for /c/[token] (256 bits, base64url). */
export function generateMagicToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 6-digit numeric passcode, easy to type on a phone. */
export function generatePasscode(): string {
  return randomInt(0, 10 ** PASSCODE_LENGTH).toString().padStart(PASSCODE_LENGTH, "0");
}

export function normalizePasscode(input: string): string {
  return input.replace(/\D/g, "");
}

/** Returns "scrypt$<salt hex>$<hash hex>". */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(passcode, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(passcode, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}
