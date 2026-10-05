import { describe, expect, it } from "vitest";
import {
  generateMagicToken,
  generatePasscode,
  hashPasscode,
  normalizePasscode,
  verifyPasscode,
} from "./secrets";

describe("secrets", () => {
  it("generates url-safe tokens with 256 bits", () => {
    const token = generateMagicToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateMagicToken()).not.toBe(token);
  });

  it("generates 6-digit passcodes, keeping leading zeros", () => {
    for (let i = 0; i < 200; i++) expect(generatePasscode()).toMatch(/^\d{6}$/);
  });

  it("normalizes spaces and dashes typed by clients", () => {
    expect(normalizePasscode(" 123-456 ")).toBe("123456");
  });

  it("verifies the right passcode and rejects others", async () => {
    const stored = await hashPasscode("012345");
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPasscode("012345", stored)).toBe(true);
    expect(await verifyPasscode("012346", stored)).toBe(false);
    expect(await verifyPasscode("12345", stored)).toBe(false);
  });

  it("salts hashes and rejects malformed stored values", async () => {
    expect(await hashPasscode("111111")).not.toBe(await hashPasscode("111111"));
    expect(await verifyPasscode("111111", "garbage")).toBe(false);
  });
});
