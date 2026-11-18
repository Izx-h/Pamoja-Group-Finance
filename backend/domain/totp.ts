import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(input: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(input: string) {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/g, "")) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) throw new Error("Invalid TOTP secret encoding.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function encryptionKey() {
  const master = process.env.MANUS_JWT_SECRET;
  if (!master) throw new Error("Platform session secret is unavailable; TOTP cannot be encrypted safely.");
  return Buffer.from(hkdfSync("sha256", master, "pamoja-security-v1", "totp-secret-encryption", 32));
}

export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptTotpSecret(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Stored TOTP secret is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function newTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function totpUri(secret: string, account: string) {
  const label = encodeURIComponent(`Pamoja:${account}`);
  const query = new URLSearchParams({ secret, issuer: "Pamoja", algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${query.toString()}`;
}

export function totpCode(secret: string, counter: number) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const current = Math.floor(now / 30_000);
  for (const counter of [current - 1, current, current + 1]) {
    const expected = Buffer.from(totpCode(secret, counter));
    const supplied = Buffer.from(code);
    if (timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

export function generateTotpSecret() {
  return newTotpSecret();
}
