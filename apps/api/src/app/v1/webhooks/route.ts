import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { webhooks } from '@/db/schema';
import { createWebhookSecret, isValidWebhookUrl } from '@/lib/webhooks';
import { requireAuth } from '@/lib/auth';
import { isMissingTableError } from '@/lib/db-errors';

export const runtime = 'nodejs';

const Body = z.object({
  url: z.string().min(8).max(2048),
  secret: z.string().min(8).max(128).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    let auth;
    try {
      auth = await requireAuth(req);
    } catch {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const d = db();
    let rows: Array<{
      id: string;
      url: string;
      enabled: boolean;
      createdAt: Date;
      lastDeliveredAt: Date | null;
    }> = [];
    try {
      rows = await d
        .select({
          id: webhooks.id,
          url: webhooks.url,
          enabled: webhooks.enabled,
          createdAt: webhooks.createdAt,
          lastDeliveredAt: webhooks.lastDeliveredAt,
        })
        .from(webhooks)
        .where(eq(webhooks.userId, auth.userId));
    } catch (err) {
      if (isMissingTableError(err, ['webhooks'])) {
        return Response.json({ error: 'webhooks_not_ready' }, { status: 503 });
      }
      throw err;
    }

    return Response.json({ webhooks: rows });
  } catch (err) {
    console.error('webhooks GET error', err);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let auth;
    try {
      auth = await requireAuth(req);
    } catch {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: 'invalid_body' }, { status: 400 });
    }

    if (!isValidWebhookUrl(parsed.data.url)) {
      return Response.json({ error: 'invalid_url' }, { status: 400 });
    }

    const secret = parsed.data.secret ?? createWebhookSecret();
    const enabled = parsed.data.enabled ?? true;

    const d = db();
    try {
      const inserted = await d
        .insert(webhooks)
        .values({
          userId: auth.userId,
          url: parsed.data.url,
          secret,
          enabled,
        })
        .returning({
          id: webhooks.id,
          url: webhooks.url,
          enabled: webhooks.enabled,
          createdAt: webhooks.createdAt,
        });

      return Response.json({
        webhook: inserted[0],
        secret,
      });
    } catch (err: any) {
      if (isMissingTableError(err, ['webhooks'])) {
        return Response.json({ error: 'webhooks_not_ready' }, { status: 503 });
      }
      const message = err?.message ?? '';
      if (message.includes('webhooks_user_url_uq')) {
        return Response.json({ error: 'webhook_exists' }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    console.error('webhooks POST error', err);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
