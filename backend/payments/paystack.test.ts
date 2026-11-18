import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyPaystackSignature } from "./paystack";

afterEach(() => {
  delete process.env.PAYSTACK_SECRET_KEY;
});

describe("Paystack webhook signature", () => {
  it("validates the HMAC-SHA512 over the raw request body", () => {
    const rawBody = Buffer.from('{"event":"charge.success"}');
    process.env.PAYSTACK_SECRET_KEY = "sk_test_signature-test-key";
    const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
    expect(verifyPaystackSignature(rawBody, signature)).toBe(true);
    expect(verifyPaystackSignature(Buffer.from("different body"), signature)).toBe(false);
    expect(verifyPaystackSignature(rawBody, "not-a-signature")).toBe(false);
  });
});
