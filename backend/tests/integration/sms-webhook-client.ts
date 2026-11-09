// Plays SMS Gateway for Android calling the incoming SMS webhook
// (POST /api/diane/sms/webhook): `sms:received` events signed with
// HMAC-SHA256(raw body + X-Timestamp), hex, in X-Signature.
import { createHmac, randomBytes } from "node:crypto";

/** The gateway phone's own number in tests (fictitious ARCEP range). */
export const GATEWAY_PHONE = "+33639985099";

/** Signs like SMS Gateway for Android. */
export function sign(raw: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(raw + timestamp)
    .digest("hex");
}

/** An `sms:received` event, as documented by docs.sms-gate.app. */
export function receivedEvent(
  sender: string,
  message: string,
  id = randomBytes(10).toString("hex"),
) {
  return {
    deviceId: "ffffffffceb0b1db0000018e937c815b",
    event: "sms:received",
    id,
    payload: {
      messageId: randomBytes(4).toString("hex"),
      message,
      sender,
      recipient: GATEWAY_PHONE,
      simNumber: 1,
      receivedAt: "2026-11-08T11:00:00.000+01:00",
    },
    webhookId: "LreFUt-Z3sSq0JufY9uWB",
  };
}

export interface WebhookOptions {
  secret: string;
  /** Unix seconds; now by default. */
  timestamp?: string;
  /** Overrides the signature; null sends no signature headers at all. */
  signature?: string | null;
}

/** POSTs `body` (an object, or a raw string) to the webhook of `url`. */
export async function postWebhook(
  url: string,
  body: unknown,
  {
    secret,
    timestamp = String(Math.floor(Date.now() / 1000)),
    signature,
  }: WebhookOptions,
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (signature !== null) {
    headers["X-Signature"] = signature ?? sign(raw, timestamp, secret);
    headers["X-Timestamp"] = timestamp;
  }
  const response = await fetch(`${url}/api/diane/sms/webhook`, {
    method: "POST",
    headers,
    body: raw,
  });
  const text = await response.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON
  const json: any = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
