import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { webhooks } from '@/db/schema';
import { createWebhookSecret, isValidWebhookUrl } from '@/lib/webhooks';
import { requireAuth } from '@/lib/auth';

const Body = z.object({
  url: z.string().min(8).max(2048),
  secret: z.string().min(8).max(128).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireAuth(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const d = db();
  const rows = await d
    .select({
      id: webhooks.id,
      url: webhooks.url,
      enabled: webhooks.enabled,
      createdAt: webhooks.createdAt,
      lastDeliveredAt: webhooks.lastDeliveredAt,
    })
    .from(webhooks)
    .where(eq(webhooks.userId, auth.userId));

  return Response.json({ webhooks: rows });
}

export async function POST(req: Request) {
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
    const message = err?.message ?? '';
    if (message.includes('webhooks_user_url_uq')) {
      return Response.json({ error: 'webhook_exists' }, { status: 409 });
    }
    throw err;
  }
}
