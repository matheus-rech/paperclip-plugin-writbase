import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyWebhookSignature, signWebhookPayload } from "../src/hmac.js";

const SECRET = "test-secret-for-hmac";
const MSG_ID = "msg_task1_1_task.created";
const BODY = '{"type":"task.created","data":{}}';

describe("HMAC verification", () => {
  it("verifies a valid signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await signWebhookPayload(MSG_ID, timestamp, BODY, SECRET);

    const valid = await verifyWebhookSignature(BODY, {
      "webhook-id": MSG_ID,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": sig,
    }, SECRET);

    expect(valid).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);

    const valid = await verifyWebhookSignature(BODY, {
      "webhook-id": MSG_ID,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": "v1,aW52YWxpZHNpZw==",
    }, SECRET);

    expect(valid).toBe(false);
  });

  it("rejects a wrong secret", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await signWebhookPayload(MSG_ID, timestamp, BODY, SECRET);

    const valid = await verifyWebhookSignature(BODY, {
      "webhook-id": MSG_ID,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": sig,
    }, "wrong-secret");

    expect(valid).toBe(false);
  });

  it("rejects tampered body", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = await signWebhookPayload(MSG_ID, timestamp, BODY, SECRET);

    const valid = await verifyWebhookSignature('{"tampered":true}', {
      "webhook-id": MSG_ID,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": sig,
    }, SECRET);

    expect(valid).toBe(false);
  });

  it("rejects timestamps too old (>5 min)", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 301; // 5 min + 1 sec
    const sig = await signWebhookPayload(MSG_ID, timestamp, BODY, SECRET);

    const valid = await verifyWebhookSignature(BODY, {
      "webhook-id": MSG_ID,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": sig,
    }, SECRET);

    expect(valid).toBe(false);
  });

  it("rejects timestamps in the future (>5 min)", async () => {
    const timestamp = Math.floor(Date.now() / 1000) + 301;
    const sig = await signWebhookPayload(MSG_ID, timestamp, BODY, SECRET);

    const valid = await verifyWebhookSignature(BODY, {
      "webhook-id": MSG_ID,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": sig,
    }, SECRET);

    expect(valid).toBe(false);
  });

  it("rejects missing headers", async () => {
    expect(
      await verifyWebhookSignature(BODY, {
        "webhook-id": "",
        "webhook-timestamp": "",
        "webhook-signature": "",
      }, SECRET),
    ).toBe(false);
  });

  it("rejects non-v1 signature prefix", async () => {
    const timestamp = Math.floor(Date.now() / 1000);

    expect(
      await verifyWebhookSignature(BODY, {
        "webhook-id": MSG_ID,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": "v2,abc123",
      }, SECRET),
    ).toBe(false);
  });
});

describe("signWebhookPayload", () => {
  it("produces consistent signatures", async () => {
    const sig1 = await signWebhookPayload(MSG_ID, 1000, BODY, SECRET);
    const sig2 = await signWebhookPayload(MSG_ID, 1000, BODY, SECRET);
    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different inputs", async () => {
    const sig1 = await signWebhookPayload(MSG_ID, 1000, BODY, SECRET);
    const sig2 = await signWebhookPayload(MSG_ID, 1001, BODY, SECRET);
    expect(sig1).not.toBe(sig2);
  });
});
