import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.paystack.co";

export type PaystackMethod = "mpesa" | "pesalink" | "card";

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

function getSecretKey() {
  return process.env.PAYSTACK_SECRET_KEY ?? "";
}

export function hasPaystackSecret() {
  return Boolean(getSecretKey());
}

export function isPaystackTestKey() {
  const key = getSecretKey();
  return key.startsWith("sk_test_");
}

async function paystackRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = getSecretKey();
  if (!secret) throw new ProviderUnavailableError("Paystack is not configured. Add a server-side test key to enable sandbox checkout.");
  if (!secret.startsWith("sk_test_") && process.env.PAYSTACK_LIVE_ENABLED !== "true") {
    throw new ProviderUnavailableError("Live Paystack calls are disabled until PAYSTACK_LIVE_ENABLED is explicitly enabled after compliance review.");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json() as { status?: boolean; message?: string; data?: T };
  if (!response.ok || !body.status || body.data === undefined) {
    throw new ProviderUnavailableError(body.message ?? `Paystack request failed (${response.status}).`);
  }
  return body.data;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountMinor: number;
  reference: string;
  phone?: string;
  method: PaystackMethod;
  groupId: number;
  contributionId: number;
}) {
  const channel = input.method === "mpesa" ? ["mobile_money"] : input.method === "pesalink" ? ["bank_transfer"] : ["card"];
  const metadata = {
    groupId: input.groupId,
    contributionId: input.contributionId,
    custom_fields: [
      { display_name: "Group ID", variable_name: "group_id", value: String(input.groupId) },
      { display_name: "Contribution ID", variable_name: "contribution_id", value: String(input.contributionId) },
    ],
  };
  return paystackRequest<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountMinor,
      currency: "KES",
      reference: input.reference,
      channels: channel,
      metadata,
      ...(input.phone ? { mobile_money: { phone: input.phone, provider: "mpesa" } } : {}),
    }),
  });
}

export async function verifyPaystackTransaction(reference: string) {
  return paystackRequest<{
    id: number;
    status: string;
    reference: string;
    amount: number;
    currency: string;
    channel: string;
    customer?: { email?: string };
    metadata?: Record<string, unknown>;
    paid_at?: string;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function verifyPaystackSignature(rawBody: Buffer, signature: string | undefined) {
  const secret = getSecretKey();
  if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
