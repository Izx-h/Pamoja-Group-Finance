import { createHash } from "node:crypto";
import express, { type Express } from "express";
import { auditLogs } from "../../database/schema";
import { getDb } from "../db";
import { recordPaystackWebhook } from "../services/payments";
import { verifyPaystackSignature } from "./paystack";

export function registerPaystackWebhook(app: Express) {
  app.post("/api/webhooks/paystack", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.header("x-paystack-signature");
    if (!verifyPaystackSignature(rawBody, signature)) {
      const db = await getDb();
      if (db) {
        await db.insert(auditLogs).values({
          groupId: null,
          actorUserId: null,
          action: "security.invalid_paystack_signature",
          entityType: "webhook",
          entityId: null,
          details: { receivedAt: new Date().toISOString() },
        });
      }
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }
    const eventType = typeof payload.event === "string" ? payload.event : "unknown";
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    const reference = typeof data.reference === "string" ? data.reference : undefined;
    const eventKey = createHash("sha256").update(rawBody).digest("hex");
    try {
      await recordPaystackWebhook({ eventKey, eventType, reference, payload });
      res.status(200).json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed.";
      console.error("[Paystack webhook] processing failed", message);
      res.status(500).json({ error: "Webhook could not be processed" });
    }
  });
}
