import crypto from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { messages, users, webhookDeliveries, webhooks } from '@/db/schema';

const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800];
const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
const WEBHOOK_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BODY = 1000;
const WEBHOOK_USER_AGENT = 'oadm-inbox-webhook/1.0';

export function createWebhookSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

export function isValidWebhookUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function signWebhookPayload(secret: string, timestamp: string, body: string) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function nextAttemptAt(attemptNumber: number) {
  if (attemptNumber >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_SECONDS[attemptNumber - 1];
  return new Date(Date.now() + delay * 1000);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function deliverWebhookDelivery(args: {
  deliveryId: string;
  webhook: { id: string; url: string; secret: string };
  message: { id: string; text: string; createdAt: Date; fromName: string; toName: string };
  attemptCount: number;
}) {
  const attemptNumber = args.attemptCount + 1;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = {
    type: 'message.created',
    deliveryId: args.deliveryId,
    attempt: attemptNumber,
    message: {
      id: args.message.id,
      fromName: args.message.fromName,
      toName: args.message.toName,
      text: args.message.text,
      createdAt: args.message.createdAt,
    },
  };
  const body = JSON.stringify(payload);
  const signature = signWebhookPayload(args.webhook.secret, timestamp, body);

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  let ok = false;

  try {
    const res = await fetchWithTimeout(
      args.webhook.url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': WEBHOOK_USER_AGENT,
          'X-OADM-Timestamp': timestamp,
          'X-OADM-Signature': `sha256=${signature}`,
          'X-OADM-Delivery': args.deliveryId,
        },
        body,
      },
      WEBHOOK_TIMEOUT_MS
    );
    responseStatus = res.status;
    responseBody = (await res.text().catch(() => ''))?.slice(0, MAX_RESPONSE_BODY) ?? null;
    ok = res.ok;
    if (!ok) {
      error = `status_${res.status}`;
    }
  } catch (err: any) {
    error = err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'fetch_error');
  }

  const now = new Date();
  const d = db();
  if (ok) {
    await d
      .update(webhookDeliveries)
      .set({
        status: 'delivered',
        attemptCount: attemptNumber,
        lastAttemptAt: now,
        nextAttemptAt: null,
        responseStatus,
        responseBody,
        error: null,
      })
      .where(eq(webhookDeliveries.id, args.deliveryId));
    await d
      .update(webhooks)
      .set({ lastDeliveredAt: now })
      .where(eq(webhooks.id, args.webhook.id));
    return { ok: true };
  }

  const next = nextAttemptAt(attemptNumber);
  await d
    .update(webhookDeliveries)
    .set({
      status: next ? 'pending' : 'failed',
      attemptCount: attemptNumber,
      lastAttemptAt: now,
      nextAttemptAt: next,
      responseStatus,
      responseBody,
      error,
    })
    .where(eq(webhookDeliveries.id, args.deliveryId));

  return { ok: false, error };
}

export async function deliverMessageWebhooks(args: {
  message: { id: string; text: string; createdAt: Date; fromName: string; toName: string; toUserId: string };
}) {
  const d = db();
  const hooks = await d
    .select({ id: webhooks.id, url: webhooks.url, secret: webhooks.secret })
    .from(webhooks)
    .where(and(eq(webhooks.userId, args.message.toUserId), eq(webhooks.enabled, true)));

  if (!hooks.length) return { deliveries: 0 };

  const deliveryRows = await d
    .insert(webhookDeliveries)
    .values(
      hooks.map((h) => ({
        webhookId: h.id,
        messageId: args.message.id,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: new Date(),
      }))
    )
    .returning({ id: webhookDeliveries.id, webhookId: webhookDeliveries.webhookId });

  const hooksById = new Map(hooks.map((h) => [h.id, h]));

  await Promise.allSettled(
    deliveryRows.map((row) => {
      const hook = hooksById.get(row.webhookId);
      if (!hook) return Promise.resolve();
      return deliverWebhookDelivery({
        deliveryId: row.id,
        webhook: hook,
        message: {
          id: args.message.id,
          text: args.message.text,
          createdAt: args.message.createdAt,
          fromName: args.message.fromName,
          toName: args.message.toName,
        },
        attemptCount: 0,
      });
    })
  );

  return { deliveries: deliveryRows.length };
}

export async function processPendingWebhookDeliveries(limit = 50) {
  const d = db();
  const now = new Date();
  const rows = await d
    .select({
      deliveryId: webhookDeliveries.id,
      attemptCount: webhookDeliveries.attemptCount,
      webhookId: webhooks.id,
      webhookUrl: webhooks.url,
      webhookSecret: webhooks.secret,
      messageId: messages.id,
      messageText: messages.text,
      messageCreatedAt: messages.createdAt,
      messageFromName: messages.fromName,
      toName: users.name,
    })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhookDeliveries.webhookId, webhooks.id))
    .innerJoin(messages, eq(webhookDeliveries.messageId, messages.id))
    .innerJoin(users, eq(messages.toUserId, users.id))
    .where(and(eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.nextAttemptAt, now), eq(webhooks.enabled, true)))
    .limit(limit);

  await Promise.allSettled(
    rows.map((row) =>
      deliverWebhookDelivery({
        deliveryId: row.deliveryId,
        webhook: { id: row.webhookId, url: row.webhookUrl, secret: row.webhookSecret },
        message: {
          id: row.messageId,
          text: row.messageText,
          createdAt: row.messageCreatedAt,
          fromName: row.messageFromName,
          toName: row.toName,
        },
        attemptCount: row.attemptCount,
      })
    )
  );

  return { processed: rows.length };
}

export const webhookConfig = {
  MAX_ATTEMPTS,
  RETRY_DELAYS_SECONDS,
  WEBHOOK_TIMEOUT_MS,
};
