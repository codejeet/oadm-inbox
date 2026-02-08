import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { messages, users } from '@/db/schema';
import { normalizeName, requireAuth } from '@/lib/auth';
import { assertSendRateLimit, getIp } from '@/lib/ratelimit';
import { deliverMessageWebhooks } from '@/lib/webhooks';

export const runtime = 'nodejs';

const Body = z.object({
  toName: z.string().min(3).max(24),
  text: z.string().min(1).max(4000),
});

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

  const toName = normalizeName(parsed.data.toName);

  const d = db();
  const to = await d.select({ id: users.id }).from(users).where(eq(users.name, toName)).limit(1);
  if (!to.length) {
    return Response.json({ error: 'recipient_not_found' }, { status: 404 });
  }

  try {
    await assertSendRateLimit({ fromUserId: auth.userId, ip: getIp(req) });
  } catch (e: any) {
    return Response.json({ error: 'rate_limited' }, { status: e.status ?? 429 });
  }

  const inserted = await d
    .insert(messages)
    .values({
      toUserId: to[0].id,
      fromUserId: auth.userId,
      fromName: auth.name,
      text: parsed.data.text,
    })
    .returning({ id: messages.id, createdAt: messages.createdAt });

  try {
    await deliverMessageWebhooks({
      message: {
        id: inserted[0].id,
        text: parsed.data.text,
        createdAt: inserted[0].createdAt,
        fromName: auth.name,
        toName: toName,
        toUserId: to[0].id,
      },
    });
  } catch {
    // Best-effort delivery; message send should still succeed.
  }

  return Response.json({ id: inserted[0].id });
}
