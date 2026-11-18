import { eq } from "drizzle-orm";
import { encryptTotpSecret, generateTotpSecret, totpUri, verifyTotp } from "../domain/totp";
import { userSecurity } from "../../database/schema";
import { getDb } from "../db";

export async function beginTotpEnrollment(input: { userId: number; account: string }) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);
  await db.transaction(async tx => {
    const [current] = await tx.select().from(userSecurity).where(eq(userSecurity.userId, input.userId)).limit(1).for("update");
    if (current?.totpEnabled) throw new Error("Authenticator protection is already enabled. Verify a current code to disable it before replacing the authenticator.");
    if (current) {
      await tx.update(userSecurity).set({ encryptedTotpSecret: encrypted, totpEnabled: false, confirmedAt: null, updatedAt: new Date() }).where(eq(userSecurity.userId, input.userId));
    } else {
      await tx.insert(userSecurity).values({ userId: input.userId, encryptedTotpSecret: encrypted, totpEnabled: false });
    }
  });
  return { secret, uri: totpUri(secret, input.account) };
}

export async function confirmTotpEnrollment(input: { userId: number; code: string }) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  const [security] = await db.select().from(userSecurity).where(eq(userSecurity.userId, input.userId)).limit(1);
  if (!security?.encryptedTotpSecret) return false;
  const secret = (await import("../domain/totp")).decryptTotpSecret(security.encryptedTotpSecret);
  if (!verifyTotp(secret, input.code)) return false;
  await db.update(userSecurity).set({ totpEnabled: true, confirmedAt: new Date(), updatedAt: new Date() }).where(eq(userSecurity.userId, input.userId));
  return true;
}

export async function verifyUserTotp(userId: number, code: string) {
  const db = await getDb();
  if (!db) return false;
  const [security] = await db.select().from(userSecurity).where(eq(userSecurity.userId, userId)).limit(1);
  if (!security?.totpEnabled || !security.encryptedTotpSecret) return false;
  const { decryptTotpSecret } = await import("../domain/totp");
  return verifyTotp(decryptTotpSecret(security.encryptedTotpSecret), code);
}
