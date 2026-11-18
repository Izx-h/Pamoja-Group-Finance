import { describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, totpCode, verifyTotp } from "./totp";

describe("TOTP security", () => {
  it("generates and verifies a six-digit code in a one-step window", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const now = 59_000;
    const code = totpCode(secret, Math.floor(now / 30_000));
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, "bad-code", now)).toBe(false);
  });

  it("generates a high-entropy secret and encrypts it at rest", () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]+$/);
    process.env.MANUS_JWT_SECRET = "test-only-key-for-unit-test";
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
    delete process.env.MANUS_JWT_SECRET;
  });
});
