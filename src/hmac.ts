/**
 * Standard Webhooks HMAC-SHA256 verification.
 *
 * Mirrors WritBase's signing logic:
 *   signature = HMAC-SHA256("{msg_id}.{timestamp}.{body}", secret)
 *   header format: "v1,{base64-encoded-signature}"
 *
 * Uses crypto.subtle.verify() for timing-safe comparison.
 */

const encoder = new TextEncoder();

const TOLERANCE_SECONDS = 5 * 60; // 5 minutes per Standard Webhooks spec

export interface WebhookHeaders {
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
}

/**
 * Verify a Standard Webhooks signature.
 * Returns true if the signature is valid and the timestamp is fresh.
 */
export async function verifyWebhookSignature(
  body: string,
  headers: WebhookHeaders,
  secret: string,
): Promise<boolean> {
  const msgId = headers["webhook-id"];
  const timestampStr = headers["webhook-timestamp"];
  const signatureHeader = headers["webhook-signature"];

  if (!msgId || !timestampStr || !signatureHeader) {
    return false;
  }

  // Check timestamp freshness (both past and future)
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) {
    return false;
  }

  // Extract base64 signature from "v1,{base64}" format
  if (!signatureHeader.startsWith("v1,")) {
    return false;
  }
  const signatureB64 = signatureHeader.slice(3);

  // Decode the received signature
  let receivedSig: Uint8Array;
  try {
    receivedSig = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }

  // Import the secret as an HMAC key
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  // Build the signing input: "{msgId}.{timestamp}.{body}"
  const data = encoder.encode(`${msgId}.${timestamp}.${body}`);

  // Use crypto.subtle.verify for timing-safe comparison
  return crypto.subtle.verify("HMAC", key, receivedSig, data);
}

/**
 * Sign a payload (for testing purposes).
 */
export async function signWebhookPayload(
  msgId: string,
  timestamp: number,
  body: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const data = encoder.encode(`${msgId}.${timestamp}.${body}`);
  const signature = await crypto.subtle.sign("HMAC", key, data);

  return `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}
